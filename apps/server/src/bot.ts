import { Bot, InlineKeyboard } from 'grammy';
import { AGE_BUCKETS, caregiverCard, defaultCostCountry, reasonText, t } from '@aman/content';
import { LANGS, type CaseEvent, type CaseRecord, type Lang } from '@aman/types';
import { COST_CODE_COUNTRY, costCallback, costChunks } from './costMessage';
import { getCase, saveCase, type DB } from './db';
import { applyFollowup, buildVoiceCase, nextFollowup, VOICE_FOLLOWUP_FIELDS, type Extractor, type FollowupField } from './voice';

function questionKey(field: FollowupField): string {
  return field === 'ageMonths' ? 'age_title' : `q_${field}`;
}

function keyboardFor(c: CaseRecord, field: FollowupField): InlineKeyboard {
  const idx = VOICE_FOLLOWUP_FIELDS.indexOf(field);
  const kb = new InlineKeyboard();
  if (field === 'ageMonths') {
    AGE_BUCKETS.forEach((b, i) => kb.text(t(c.language, b.key), `a|${c.id}|${idx}|b${i}`).row());
  } else {
    kb.text(t(c.language, 'yes'), `a|${c.id}|${idx}|y`).text(t(c.language, 'no'), `a|${c.id}|${idx}|n`);
  }
  return kb;
}

const MAX_REASONS = 2;
const MAX_RETURN_SIGNS = 4;

/** Only the first follow-up of a case explains why the bot is asking; later ones send just the question. */
export function followupText(lang: Lang, field: FollowupField, first: boolean): string {
  const question = t(lang, questionKey(field));
  return first ? `${t(lang, 'voice_followup')}\n${question}` : question;
}

export function decisionMessage(c: CaseRecord): string {
  const L = c.language;
  const outcome = c.decision.outcome;
  const card = caregiverCard(L, outcome, c.symptoms);
  const reasonKeys = c.decision.reasonKeys.slice(0, MAX_REASONS);
  const lines = [t(L, `decision_${outcome}`)];
  if (reasonKeys.length > 0) lines.push('', ...reasonKeys.map((k) => `• ${reasonText(L, k)}`));
  // The missing-data reason already asks for review, so never send both.
  if (c.needsHumanReview && !reasonKeys.includes('missing_critical_data')) lines.push('', t(L, 'needs_review'));
  // The card title restates the decision line, so it is left out.
  const homeCare = t(L, 'card_home_care');
  const cardLines = outcome === 'HOME' ? card.lines : card.lines.filter((l) => l !== homeCare);
  if (cardLines.length > 0) lines.push('', ...cardLines);
  lines.push('', card.returnTitle, ...card.returnSigns.slice(0, MAX_RETURN_SIGNS).map((s) => `• ${s}`), '', t(L, 'banner'));
  return lines.join('\n');
}

export function startBot(token: string, db: DB, extractor: Extractor, emit: (e: CaseEvent) => void): Bot {
  const bot = new Bot(token);
  const store = (c: CaseRecord, type: CaseEvent['type']) => {
    saveCase(db, c);
    emit({ type, case: c });
  };

  const askOrDecide = async (chatId: number, c: CaseRecord, first: boolean) => {
    const field = nextFollowup(c);
    if (field) {
      await bot.api.sendMessage(chatId, followupText(c.language, field, first), {
        reply_markup: keyboardFor(c, field),
      });
    } else {
      // Plain text: translated reasons and card lines are not Markdown-escaped, and a stray _ or * would make Telegram reject the reply.
      await bot.api.sendMessage(chatId, decisionMessage(c));
      const country = defaultCostCountry(c.language);
      const code = country === 'pk_punjab' ? 'p' : country === 'et' ? 'e' : 'x';
      await bot.api.sendMessage(chatId, t(c.language, 'costs_title'), {
        reply_markup: new InlineKeyboard().text(t(c.language, 'see_costs'), costCallback(c.id, code)),
      });
    }
  };

  // The outcome always comes from the stored case, never from the button.
  const sendCosts = async (chatId: number, id: string, code: string) => {
    const c = getCase(db, id);
    if (!c) return;
    const L = c.language;
    if (code === 'x') {
      const kb = new InlineKeyboard().text(t(L, 'country_pk_punjab'), costCallback(c.id, 'p')).text(t(L, 'country_et'), costCallback(c.id, 'e'));
      await bot.api.sendMessage(chatId, t(L, 'costs_country'), { reply_markup: kb });
      return;
    }
    const country = code === 'p' || code === 'e' ? COST_CODE_COUNTRY[code] : null;
    if (!country) return;
    for (const chunk of costChunks(c.decision.outcome, country, L)) await bot.api.sendMessage(chatId, chunk);
  };

  bot.command('start', (ctx) =>
    ctx.reply('Aman demo bot. Send a voice note about a sick child in Urdu, Amharic or English. Synthetic demo only; not a diagnosis.'),
  );

  bot.on(['message:voice', 'message:audio'], async (ctx) => {
    const fileInfo = ctx.message.voice ?? ctx.message.audio;
    if (!fileInfo) return;
    const userLang = (LANGS as readonly string[]).includes(ctx.from?.language_code ?? '') ? (ctx.from!.language_code as Lang) : 'en';
    try {
      const file = await ctx.getFile();
      const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
      const audio = Buffer.from(await res.arrayBuffer());
      const extraction = await extractor(audio, fileInfo.mime_type ?? 'audio/ogg');
      const c = buildVoiceCase(extraction, userLang);
      store(c, 'case_upserted');
      if (extraction.unclear || extraction.language === 'other') {
        await ctx.reply(t(c.language, 'voice_unclear'));
        return;
      }
      await askOrDecide(ctx.chat.id, c, true);
    } catch (err) {
      console.error('voice note failed', err);
      await ctx.reply(t(userLang, 'voice_unclear'));
    }
  });

  bot.on('callback_query:data', async (ctx) => {
    const [kind, id, idxStr, val] = ctx.callbackQuery.data.split('|');
    await ctx.answerCallbackQuery();
    if (kind === 'c') {
      if (ctx.chat) await sendCosts(ctx.chat.id, id, idxStr);
      return;
    }
    if (kind !== 'a') return;
    const c = getCase(db, id);
    const field = VOICE_FOLLOWUP_FIELDS[Number(idxStr)];
    if (!c || !field || !ctx.chat) return;
    const value = field === 'ageMonths' ? AGE_BUCKETS[Number(val.slice(1))]?.ageMonths : val === 'y';
    if (value === undefined) return;
    const next = applyFollowup(c, field, value);
    store(next, 'case_updated');
    await askOrDecide(ctx.chat.id, next, false);
  });

  bot.catch((err) => console.error('telegram bot error', err.error));
  bot.start({ onStart: (me) => console.log(`Telegram bot @${me.username} polling`) }).catch((err) => {
    console.error('Telegram bot stopped; the rest of the server keeps running.', err);
  });
  return bot;
}
