import { createContext, useContext, useEffect, useState } from 'react';
import { RTL, t as translate } from '@aman/content';
import type { Lang } from '@aman/types';

export const LangContext = createContext<{ lang: Lang; setLang: (l: Lang) => void }>({ lang: 'en', setLang: () => {} });

export function useT() {
  const { lang, setLang } = useContext(LangContext);
  return { lang, setLang, t: (key: string) => translate(lang, key), dir: RTL[lang] ? ('rtl' as const) : ('ltr' as const) };
}

const SPEECH_LANG: Record<Lang, string> = { en: 'en-US', ur: 'ur-PK', am: 'am-ET' };

const recordings = new Map<string, Promise<boolean>>();

/** True when /audio/<lang>/<promptKey>.mp3 is bundled. The content-type check stops an SPA index.html fallback counting as audio. */
function hasRecording(lang: Lang, promptKey: string): Promise<boolean> {
  const url = `/audio/${lang}/${promptKey}.mp3`;
  let found = recordings.get(url);
  if (!found) {
    found = fetch(url, { method: 'HEAD' })
      .then((r) => r.status === 200 && (r.headers.get('content-type') ?? '').startsWith('audio/'))
      .catch(() => false);
    recordings.set(url, found);
  }
  return found;
}

/** The device voice for this language, if any. Some browsers load voices late, so wait briefly for them. */
async function deviceVoice(lang: Lang): Promise<SpeechSynthesisVoice | null> {
  if (!('speechSynthesis' in window)) return null;
  let voices = window.speechSynthesis.getVoices();
  if (voices.length === 0) {
    voices = await new Promise<SpeechSynthesisVoice[]>((resolve) => {
      const done = () => resolve(window.speechSynthesis.getVoices());
      window.speechSynthesis.addEventListener('voiceschanged', done, { once: true });
      setTimeout(done, 1000);
    });
  }
  return voices.find((v) => v.lang.toLowerCase().startsWith(lang)) ?? null;
}

/** Whether this prompt can be read aloud: a recorded file is bundled, or the device has a voice for the language. */
export async function canSpeak(lang: Lang, promptKey: string): Promise<boolean> {
  return (await hasRecording(lang, promptKey)) || (await deviceVoice(lang)) !== null;
}

/** False until canSpeak resolves, so a read-aloud button never shows when it would do nothing. */
export function useCanSpeak(lang: Lang, promptKey: string | undefined): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    setOk(false);
    if (!promptKey) return;
    let live = true;
    void canSpeak(lang, promptKey).then((v) => live && setOk(v));
    return () => {
      live = false;
    };
  }, [lang, promptKey]);
  return ok;
}

/**
 * Plays a recorded prompt if one is bundled, else uses the device voice (Urdu and Amharic voices vary by device).
 * With auto, it is not a response to a tap: if the browser blocks autoplay it stays silent.
 */
export async function speak(lang: Lang, promptKey: string, text: string, { auto = false } = {}): Promise<void> {
  if (auto && navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    if (await hasRecording(lang, promptKey)) {
      try {
        await new Audio(`/audio/${lang}/${promptKey}.mp3`).play();
        return;
      } catch (e) {
        if ((e as DOMException).name === 'NotAllowedError') return;
      }
    }
    const voice = await deviceVoice(lang);
    if (!voice) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = SPEECH_LANG[lang];
    u.voice = voice;
    u.onerror = () => {};
    window.speechSynthesis.speak(u);
  } catch {
    // speech is a convenience; never surface its failures
  }
}
