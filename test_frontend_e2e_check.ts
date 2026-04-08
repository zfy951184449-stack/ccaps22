import { chromium } from 'playwright';

(async () => {
    console.log("启动 Playwright 测试端查证...");
    try {
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();
        
        console.log("访问 http://localhost:3000/process-templates ...");
        await page.goto('http://localhost:3000/process-templates', { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000); // Wait for potential rendering
        
        await page.screenshot({ path: '/Users/zhengfengyi/MFG8APS/test_e2e_entry.png' });
        console.log("快照1已经截取: entry");
        
        // 尝试寻找 TEST RUN
        const locators = [
            page.locator('text="WBP2486DSP_TESTRUN"').first(),
            page.locator('text="TEST RUN"').first()
        ];
        
        let found = false;
        for (const loc of locators) {
            if (await loc.isVisible()) {
                await loc.click();
                found = true;
                break;
            }
        }

        if (found) {
            console.log("已点击进入 WBP2486DSP_TESTRUN，等待大图挂载...");
            await page.waitForTimeout(6000); // 渲染巨大甘特图需要时间
            await page.screenshot({ path: '/Users/zhengfengyi/MFG8APS/test_e2e_gantt.png', fullPage: true });
            console.log("快照2已经截取: gantt full");
        } else {
             console.log("❗未在首页自动识别出进入行文字，请参阅外面的截屏 1 自行确认。");
        }
        await browser.close();
    } catch (e) {
        console.log("测试崩溃或未装载 Playwright：", e);
    }
})();
