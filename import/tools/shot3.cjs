const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark', reducedMotion: 'reduce' });
  await p.goto('file:///home/claude/jig/jig-spec.html');
  await p.waitForTimeout(300);
  await p.evaluate(() => window.scrollTo(0, document.getElementById('ex-70').offsetTop + 300));
  await p.waitForTimeout(500);
  await p.screenshot({ path: '/home/claude/shot-final-desk.png' });
  await b.close();
})();
