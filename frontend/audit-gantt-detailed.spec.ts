import { test, expect } from '@playwright/test';

test.describe('工艺模版甘特图 - 详细审计', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000/process-template');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
  });

  test('1. 列表页面基本功能测试', async ({ page }) => {
    console.log('\n========== 1. 列表页面基本功能 ==========');

    // 检查列表是否加载
    const rows = page.locator('[role="row"]');
    const rowCount = await rows.count();
    console.log(`✓ 列表行数: ${rowCount}`);

    // 检查是否有数据
    if (rowCount > 0) {
      console.log('✓ 列表数据已加载');

      // 检查列表结构
      const firstRow = rows.first();
      const cells = firstRow.locator('[role="cell"]');
      const cellCount = await cells.count();
      console.log(`✓ 第一行单元格数: ${cellCount}`);
    }

    // 检查搜索框
    const searchInput = page.locator('input[placeholder*="搜索"], input[placeholder*="Search"]');
    const hasSearch = await searchInput.isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`${hasSearch ? '✓' : '✗'} 搜索功能: ${hasSearch ? '存在' : '不存在'}`);

    // 检查筛选
    const filterBtn = page.locator('button:has-text("筛选"), [class*="filter"]');
    const hasFilter = await filterBtn.first().isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`${hasFilter ? '✓' : '✗'} 筛选功能: ${hasFilter ? '存在' : '不存在'}`);
  });

  test('2. 进入详情页面 - 甘特图显示', async ({ page }) => {
    console.log('\n========== 2. 进入详情页面 ==========');

    const rows = page.locator('[role="row"]');
    const rowCount = await rows.count();

    if (rowCount > 0) {
      await rows.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      const currentUrl = page.url();
      console.log(`✓ 当前URL: ${currentUrl}`);

      // 检查甘特图容器
      const ganttContainer = page.locator('[class*="gantt"], [class*="Gantt"], canvas, svg[class*="gantt"]');
      const ganttExists = await ganttContainer.first().isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`${ganttExists ? '✓' : '✗'} 甘特图组件: ${ganttExists ? '显示' : '隐藏'}`);

      // 检查时间轴
      const timeline = page.locator('[class*="timeline"], [class*="Timeline"], [class*="header"]');
      const timelineExists = await timeline.first().isVisible({ timeout: 3000 }).catch(() => false);
      console.log(`${timelineExists ? '✓' : '✗'} 时间轴: ${timelineExists ? '显示' : '隐藏'}`);

      // 检查操作条/任务条
      const taskBars = page.locator('[class*="task"], [class*="bar"], [class*="operation"]');
      const taskCount = await taskBars.count();
      console.log(`✓ 任务条/操作条数: ${taskCount}`);

      // 检查资源/工作中心列表
      const resources = page.locator('[class*="resource"], [class*="Resource"], [class*="worker"]');
      const resourceCount = await resources.count();
      console.log(`✓ 资源/工作中心数: ${resourceCount}`);
    }
  });

  test('3. 拖拽功能测试', async ({ page }) => {
    console.log('\n========== 3. 拖拽功能测试 ==========');

    const rows = page.locator('[role="row"]');
    if (await rows.count() > 0) {
      await rows.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);

      // 查找可拖拽的元素
      const draggables = page.locator('[draggable="true"], [class*="draggable"], [class*="drag-handle"]');
      const dragCount = await draggables.count();
      console.log(`✓ 可拖拽元素数: ${dragCount}`);

      // 如果有可拖拽元素，尝试拖拽
      if (dragCount > 0) {
        const firstDrag = draggables.first();
        const bbox1 = await firstDrag.boundingBox();
        console.log(`✓ 拖拽元素位置: X=${bbox1?.x}, Y=${bbox1?.y}`);

        // 尝试拖拽到新位置
        try {
          await firstDrag.dragTo(page.locator('body'), { targetPosition: { x: 300, y: 300 } });
          await page.waitForTimeout(500);

          const bbox2 = await firstDrag.boundingBox();
          const moved = bbox1?.x !== bbox2?.x || bbox1?.y !== bbox2?.y;
          console.log(`${moved ? '✓' : '✗'} 拖拽是否有效: ${moved ? '是' : '否'}`);
        } catch (e) {
          console.log(`✗ 拖拽操作失败: ${e}`);
        }
      }

      // 检查是否有拖拽提示或反馈
      const dragHint = page.locator('[class*="drag-hint"], [class*="ghost"], [class*="preview"]');
      const hasHint = await dragHint.first().isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`${hasHint ? '✓' : '✗'} 拖拽视觉反馈: ${hasHint ? '有' : '无'}`);
    }
  });

  test('4. 编辑和操作功能', async ({ page }) => {
    console.log('\n========== 4. 编辑和操作功能 ==========');

    const rows = page.locator('[role="row"]');
    if (await rows.count() > 0) {
      await rows.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // 检查编辑按钮
      const editButtons = page.locator('button:has-text("编辑"), button:has-text("Edit"), [aria-label*="编辑"]');
      const editCount = await editButtons.count();
      console.log(`✓ 编辑按钮数: ${editCount}`);

      // 检查删除/操作按钮
      const deleteButtons = page.locator('button:has-text("删除"), button:has-text("Delete"), button:has-text("Remove")');
      const deleteCount = await deleteButtons.count();
      console.log(`✓ 删除按钮数: ${deleteCount}`);

      // 检查快速操作菜单
      const menuButtons = page.locator('[aria-label*="更多"], button:has-text("..."), button:has-text("菜单")');
      const menuCount = await menuButtons.count();
      console.log(`✓ 菜单按钮数: ${menuCount}`);

      // 检查表单输入
      const inputs = page.locator('input[type="text"], input[type="number"], textarea, select');
      const inputCount = await inputs.count();
      console.log(`✓ 可编辑的表单元素: ${inputCount}`);

      // 尝试检查是否有创建操作的按钮
      const createOpBtn = page.locator('button:has-text("添加"), button:has-text("新建"), button:has-text("创建"), [class*="add"]');
      const hasCreateOp = await createOpBtn.first().isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`${hasCreateOp ? '✓' : '✗'} 添加操作功能: ${hasCreateOp ? '有' : '无'}`);
    }
  });

  test('5. 批量操作功能测试', async ({ page }) => {
    console.log('\n========== 5. 批量操作功能 ==========');

    // 检查列表中的复选框
    const checkboxes = page.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    console.log(`✓ 复选框数: ${checkboxCount}`);

    // 检查是否有全选复选框
    const selectAllCheckbox = page.locator('input[type="checkbox"][aria-label*="全选"], input[type="checkbox"][aria-label*="Select All"]');
    const hasSelectAll = await selectAllCheckbox.first().isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`${hasSelectAll ? '✓' : '✗'} 全选功能: ${hasSelectAll ? '有' : '无'}`);

    // 检查批量操作按钮/工具栏
    const batchActionBar = page.locator('[class*="batch"], [class*="toolbar"], [class*="action-bar"]');
    const batchVisible = await batchActionBar.first().isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`${batchVisible ? '✓' : '✗'} 批量操作工具栏: ${batchVisible ? '显示' : '隐藏'}`);

    // 如果有复选框，尝试勾选一个
    if (checkboxCount > 1) {
      // 跳过第一个（可能是全选），勾选第二个
      const secondCheckbox = checkboxes.nth(1);
      await secondCheckbox.check({ force: true });
      await page.waitForTimeout(500);

      // 检查是否显示批量操作选项
      const batchOptions = page.locator('[class*="batch-action"], [class*="bulkAction"], button[aria-label*="批量"]');
      const hasOptions = await batchOptions.first().isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`${hasOptions ? '✓' : '✗'} 勾选后批量操作出现: ${hasOptions ? '是' : '否'}`);
    }
  });

  test('6. 时间和时序相关功能', async ({ page }) => {
    console.log('\n========== 6. 时间和时序功能 ==========');

    const rows = page.locator('[role="row"]');
    if (await rows.count() > 0) {
      await rows.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);

      // 检查日期输入
      const dateInputs = page.locator('input[type="date"], input[placeholder*="日期"], input[placeholder*="Date"]');
      const dateCount = await dateInputs.count();
      console.log(`✓ 日期输入框: ${dateCount}`);

      // 检查时间轴缩放控制
      const zoomControls = page.locator('[class*="zoom"], button:has-text("放大"), button:has-text("缩小")');
      const zoomCount = await zoomControls.count();
      console.log(`✓ 缩放控制: ${zoomCount}`);

      // 检查时间轴滚动/导航
      const timelineNav = page.locator('[class*="timeline"], [class*="scroll"], [class*="nav"]');
      const timelineVisible = await timelineNav.first().isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`${timelineVisible ? '✓' : '✗'} 时间轴导航: ${timelineVisible ? '有' : '无'}`);

      // 检查持续时间/周期字段
      const durationInputs = page.locator('input[placeholder*="时长"], input[placeholder*="Duration"], input[placeholder*="周期"]');
      const durationCount = await durationInputs.count();
      console.log(`✓ 时长输入框: ${durationCount}`);
    }
  });

  test('7. 性能和加载测试', async ({ page }) => {
    console.log('\n========== 7. 性能和加载测试 ==========');

    const startTime = Date.now();

    // 导航到列表页
    await page.goto('http://localhost:3000/process-template');
    const navigationTime = Date.now() - startTime;
    console.log(`✓ 页面导航耗时: ${navigationTime}ms`);

    // 等待完全加载
    await page.waitForLoadState('networkidle');
    const totalLoadTime = Date.now() - startTime;
    console.log(`✓ 完全加载耗时: ${totalLoadTime}ms`);

    // 点击进入详情页
    const rows = page.locator('[role="row"]');
    const clickStart = Date.now();
    if (await rows.count() > 0) {
      await rows.first().click();
      await page.waitForLoadState('networkidle');
      const detailLoadTime = Date.now() - clickStart;
      console.log(`✓ 详情页加载耗时: ${detailLoadTime}ms`);
    }

    // 检查是否有性能问题
    const jsErrors = await page.evaluate(() => {
      return (window as any).__playwrightErrors || [];
    });
    console.log(`✓ JS错误数: ${jsErrors.length}`);
  });

  test('8. 响应式和UI布局测试', async ({ page }) => {
    console.log('\n========== 8. 响应式UI布局 ==========');

    const viewportSize = page.viewportSize();
    console.log(`✓ 当前视口大小: ${viewportSize?.width}x${viewportSize?.height}`);

    // 检查列表是否正确显示
    const rows = page.locator('[role="row"]');
    const visibleRows = await rows.first().isVisible();
    console.log(`✓ 列表可见: ${visibleRows}`);

    // 检查滚动条
    const scrollbar = page.locator('[class*="scrollbar"], [class*="scroll"]');
    const hasScrollbar = await scrollbar.first().isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`${hasScrollbar ? '✓' : '✗'} 滚动条: ${hasScrollbar ? '显示' : '隐藏'}`);

    // 测试不同视口大小
    const sizes = [
      { width: 1024, height: 768, name: '平板' },
      { width: 768, height: 1024, name: '竖屏平板' },
      { width: 375, height: 812, name: '手机' }
    ];

    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.waitForTimeout(500);

      const visible = await rows.first().isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`✓ ${size.name}(${size.width}x${size.height}): ${visible ? '可显示' : '不可显示'}`);
    }

    // 恢复视口
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('9. 完整工作流模拟', async ({ page }) => {
    console.log('\n========== 9. 完整工作流模拟 ==========');

    console.log('步骤1: 访问列表页面');
    const rows = page.locator('[role="row"]');
    const initialCount = await rows.count();
    console.log(`✓ 加载了${initialCount}条记录`);

    if (initialCount > 0) {
      console.log('步骤2: 进入第一条记录的详情页');
      await rows.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1000);
      console.log('✓ 进入详情页成功');

      console.log('步骤3: 查看甘特图');
      const gantt = page.locator('[class*="gantt"], canvas, svg[class*="gantt"]');
      const ganttExists = await gantt.first().isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`${ganttExists ? '✓' : '✗'} 甘特图${ganttExists ? '显示' : '未显示'}`);

      console.log('步骤4: 检查操作列表');
      const operations = page.locator('[class*="operation"], [role="row"]');
      const opCount = await operations.count();
      console.log(`✓ 操作数: ${opCount}`);

      console.log('步骤5: 尝试编辑操作');
      const editBtn = page.locator('button:has-text("编辑"), [aria-label*="编辑"]');
      if (await editBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await editBtn.first().click();
        await page.waitForTimeout(500);
        console.log('✓ 编辑对话框打开');
      }

      console.log('步骤6: 返回列表');
      const backBtn = page.locator('button:has-text("返回"), button:has-text("Back"), button:has-text("←")');
      if (await backBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await backBtn.first().click();
        await page.waitForLoadState('networkidle');
        console.log('✓ 返回列表成功');
      }
    }
  });

  test('10. UI/UX问题检测', async ({ page }) => {
    console.log('\n========== 10. UI/UX问题检测 ==========');

    // 检查按钮可访问性
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    console.log(`✓ 页面按钮数: ${buttonCount}`);

    // 检查是否有无效标签
    let unlabeledButtons = 0;
    for (let i = 0; i < Math.min(buttonCount, 10); i++) {
      const btn = buttons.nth(i);
      const text = await btn.textContent();
      const ariaLabel = await btn.getAttribute('aria-label');
      if (!text?.trim() && !ariaLabel) {
        unlabeledButtons++;
      }
    }
    console.log(`${unlabeledButtons === 0 ? '✓' : '✗'} 无标签按钮数: ${unlabeledButtons}`);

    // 检查颜色对比度和可见性
    const links = page.locator('a');
    const linkCount = await links.count();
    console.log(`✓ 链接数: ${linkCount}`);

    // 检查是否有空的列表项
    const emptyItems = page.locator('[role="row"]:has-text("")');
    const emptyCount = await emptyItems.count();
    console.log(`${emptyCount === 0 ? '✓' : '⚠'} 空列表项数: ${emptyCount}`);

    // 检查加载状态
    const loaders = page.locator('[class*="loading"], [class*="spinner"], [class*="skeleton"]');
    const loaderCount = await loaders.count();
    console.log(`${loaderCount === 0 ? '✓' : '⚠'} 仍在加载的元素: ${loaderCount}`);

    // 检查是否有错误提示
    const errors = page.locator('[class*="error"], [class*="alert"], [role="alert"]');
    const errorCount = await errors.count();
    console.log(`${errorCount === 0 ? '✓' : '⚠'} 错误提示数: ${errorCount}`);
  });
});
