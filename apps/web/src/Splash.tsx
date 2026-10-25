/** Only mounted on a fresh mobile launch; resuming the page does not replay it. */
export function Splash() {
  return (
    <div className="splash" role="status" aria-label="Aman — referral support">
      <div className="splash-brand" aria-hidden="true">
        <img src="/icon.svg" alt="" width="112" height="112" className="mb-4 h-28 w-28" />
        <div lang="am" className="text-5xl font-bold">አማን</div>
        <div lang="ur" dir="rtl" className="text-5xl font-bold">امان</div>
        <div className="text-4xl font-bold tracking-wide">Aman</div>
      </div>
      <p className="splash-caption">Referral support</p>
    </div>
  );
}
