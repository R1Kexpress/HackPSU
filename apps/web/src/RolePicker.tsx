import { LANG_NAMES } from '@aman/content';
import { LANGS, type Lang } from '@aman/types';
import { useT } from './i18n';
import { WEB_ROLES, type Role } from './role';
import { Icon } from './Icon';

export function RolePicker({ onPick }: { onPick: (r: Role) => void }) {
  const { t, lang, setLang, dir } = useT();
  return (
    <div dir={dir} lang={lang} className="mx-auto flex max-w-xl flex-col gap-5 px-4 pb-10 pt-6">
      <h1 className="text-[1.75rem] font-bold leading-tight">{t('role_title')}</h1>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t('choose_language')}>
        {LANGS.map((l: Lang) => (
          <button key={l} lang={l} aria-pressed={lang === l} className={`min-h-12 rounded-full border-2 px-4 py-2 text-base font-semibold ${lang === l ? 'border-teal bg-teal text-paper' : 'border-teal/25 text-teal'}`} onClick={() => setLang(l)}>
            {LANG_NAMES[l]}
          </button>
        ))}
      </div>
      <div className="grid gap-3">
        {WEB_ROLES.map((r) => (
          <button key={r} className="btn-quiet min-h-32 justify-start gap-4 rounded-[1.25rem] text-start" onClick={() => onPick(r)}>
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-soft/70">
              <Icon name={r === 'clinic' ? 'clinic' : 'stethoscope'} />
            </span>
            <span className="flex flex-col">
              <span className="text-xl font-bold">{t(`role_${r}`)}</span>
              <span className="text-sm font-normal text-ink-soft">{t(`role_${r}_hint`)}</span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
