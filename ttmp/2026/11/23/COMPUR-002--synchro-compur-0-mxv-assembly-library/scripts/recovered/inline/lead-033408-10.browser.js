async page => { const txt=await page.locator('body').innerText(); return txt.slice(0,2000); }
