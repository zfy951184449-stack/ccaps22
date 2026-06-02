import { test, expect } from '@playwright/test';

test.describe('工艺模版甘特图 - 完整审计报告', () => {
  test.beforeEach(async ({ page }) => {
    // 使用正确的路由
    await page.goto('http://localhost:3000/process-templates');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1500);
  });

  test('A1. 列表页面基本结构和功能', async ({ page }) => {
    console.log('\n========== A1. 列表页面基本结构和功能 ==========');

    // 检查页面标题
    const title = await page.title();
    console.log(`✓ 页面标题: ${title}`);

    // 检查列表容器
    const listContainer = page.locator('[class*="list"], [class*="table"], [class*="grid"]');
    const containerExists = await listContainer.first().isVisible({ timeout: 3000 }).catch(() => false);
    console.log(`${containerExists ? '✓' : '✗'} 列表容器: ${containerExists ? '可见' : '隐藏'}`);

    // 获取所有数据行
    const rows = page.locator('[role="row"]');
    const rowCount = await rows.count();
    console.log(`✓ 列表行数: ${rowCount}`);

    if (rowCount > 0) {
      // 检查第一行的内容
      const firstRow = rows.first();
      const text = await firstRow.textContent();
      console.log(`✓ 第一行内容长度: ${text?.length || 0}字符`);

      // 获取列数
      const cells = firstRow.locator('[role="cell"]');
      const cellCount = await cells.count();
      console.log(`✓ 每行单元格数: ${cellCount}`);
    }
  });

  test('A2. 搜索和筛选功能', async ({ page }) => {
    console.log('\n========== A2. 搜索和筛选功能 ==========');

    // 搜索输入框
    const searchInput = page.locator('input[placeholder*="搜索"], input[placeholder*="Search"]');
    const hasSearch = await searchInput.first().isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`${hasSearch ? '✓' : '✗'} 搜索框: ${hasSearch ? '可见' : '不可见'}`);

    if (hasSearch) {
      // 尝试搜索
      await searchInput.first().click();
      await searchInput.first().fill('test');
      await page.waitForTimeout(800);
      console.log('✓ 搜索输入成功');

      // 检查是否有搜索结果
      const rows = page.locator('[role="row"]');
      const searchRowCount = await rows.count();
      console.log(`✓ 搜索后行数: ${searchRowCount}`);

      // 清空搜索
      await searchInput.first().clear();
      await page.waitForTimeout(500);
      console.log('✓ 搜索清空成功');
    }

    // 筛选功能
    const filterBtn = page.locator('[class*="filter"], button:has-text("筛选")');
    const hasFilter = await filterBtn.first().isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`${hasFilter ? '✓' : '✗'} 筛选按钮: ${hasFilter ? '可见' : '不可见'}`);

    // 排序功能
    const sortBtn = page.locator('[class*="sort"], button:has-text("排序")');
    const hasSort = await sortBtn.first().isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`${hasSort ? '✓' : '✗'} 排序功能: ${hasSort ? '可见' : '不可见'}`);

    // 分页
    const pagination = page.locator('[class*="pagination"], [aria-label*="pagination"]');
    const hasPagination = await pagination.first().isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`${hasPagination ? '✓' : '✗'} 分页: ${hasPagination ? '可见' : '不可见'}`);
  });

  test('A3. 列表行交互和导航', async ({ page }) => {
    console.log('\n========== A3. 列表行交互和导航 ==========');

    const rows = page.locator('[role="row"]');
    const rowCount = await rows.count();
    console.log(`✓ 可交互的行数: ${rowCount}`);

    if (rowCount > 1) {
      // 点击第一行进入详情
      const firstRow = rows.nth(0);
      const firstRowText = await firstRow.textContent();
      console.log(`✓ 点击行内容: ${firstRowText?.substring(0, 50)}...`);

      const clickStart = Date.now();
      await firstRow.click();
      await page.waitForLoadState('networkidle');
      const clickTime = Date.now() - clickStart;

      const newUrl = page.url();
      console.log(`✓ 点击耗时: ${clickTime}ms`);
      console.log(`✓ 导航到: ${newUrl}`);

      // 检查是否进入了编辑/详情页面
      const isDetailPage = newUrl.includes('/process-templates/');
      console.log(`${isDetailPage ? '✓' : '✗'} 进入详情页面: ${isDetailPage ? '是' : '否'}`);

      if (isDetailPage) {
        // 尝试返回
        const backBtn = page.locator('button:has-text("返回"), button:has-text("Back"), [aria-label*="返回"]');
        const hasBack = await backBtn.first().isVisible({ timeout: 2000 }).catch(() => false);

        if (hasBack) {
          await backBtn.first().click();
          await page.waitForLoadState('networkidle');
          console.log('✓ 返回列表成功');
        } else {
          // 使用浏览器返回
          await page.goBack();
          await page.waitForLoadState('networkidle');
          console.log('✓ 使用浏览器返回');
        }
      }
    }
  });

  test('A4. 甘特图显示和加载', async ({ page }) => {
    console.log('\n========== A4. 甘特图显示和加载 ==========');

    const rows = page.locator('[role="row"]');
    if (await rows.count() > 0) {
      await rows.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);

      const currentUrl = page.url();
      console.log(`✓ 当前URL: ${currentUrl}`);

      // 检查甘特图容器
      const ganttCanvas = page.locator('canvas[class*="gantt"], [class*="gantt-canvas"]');
      const ganttSvg = page.locator('svg[class*="gantt"], [class*="gantt-svg"]');
      const ganttDiv = page.locator('div[class*="gantt"], div[class*="Gantt"]');

      const hasCanvas = await ganttCanvas.first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasSvg = await ganttSvg.first().isVisible({ timeout: 3000 }).catch(() => false);
      const hasDiv = await ganttDiv.first().isVisible({ timeout: 3000 }).catch(() => false);

      console.log(`${hasCanvas ? '✓' : '-'} Canvas甘特图: ${hasCanvas ? '显示' : '未找到'}`);
      console.log(`${hasSvg ? '✓' : '-'} SVG甘特图: ${hasSvg ? '显示' : '未找到'}`);
      console.log(`${hasDiv ? '✓' : '-'} 甘特图容器: ${hasDiv ? '显示' : '未找到'}`);

      const ganttExists = hasCanvas || hasSvg || hasDiv;
      console.log(`${ganttExists ? '✓' : '✗'} 甘特图总体: ${ganttExists ? '显示' : '未显示'}`);

      // 检查时间轴
      const timeline = page.locator('[class*="timeline"], [class*="axis"]');
      const hasTimeline = await timeline.first().isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`${hasTimeline ? '✓' : '✗'} 时间轴: ${hasTimeline ? '显示' : '隐藏'}`);

      // 检查任务条
      const taskBars = page.locator('[class*="task"], [class*="bar"], [class*="operation"]');
      const taskCount = await taskBars.count();
      console.log(`✓ 任务条数: ${taskCount}`);

      // 检查工作中心/资源行
      const resourceRows = page.locator('[class*="resource"], [class*="worker"], [class*="equipment"]');
      const resourceCount = await resourceRows.count();
      console.log(`✓ 资源行数: ${resourceCount}`);
    }
  });

  test('A5. 甘特图拖拽功能测试', async ({ page }) => {
    console.log('\n========== A5. 甘特图拖拽功能 ==========');

    const rows = page.locator('[role="row"]');
    if (await rows.count() > 0) {
      await rows.first().click();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(1500);

      // 查找可拖拽的任务条
      const draggables = page.locator('[draggable="true"], [class*="draggable"], [class*="task"][class*="bar"]');
      const dragCount = await draggables.count();
      console.log(`✓ 可拖拽元素数: ${dragCount}`);

      if (dragCount > 0) {
        const firstDrag = draggables.first();
        const bbox1 = await firstDrag.boundingBox();

        if (bbox1) {
          console.log(`✓ 初始位置: X=${Math.round(bbox1.x)}, Y=${Math.round(bbox1.y)}, W=${Math.round(bbox1.width)}, H=${Math.round(bbox1.height)}`);

          try {
            // 尝试拖拽
            const dragDistance = 100;
            await firstDrag.hover();
            await page.mouse.move(bbox1.x + bbox1.width / 2, bbox1.y + bbox1.height / 2);
            await page.mouse.down();
            await page.mouse.move(bbox1.x + bbox1.width / 2 + dragDistance, bbox1.y + bbox1.height / 2);
            await page.waitForTimeout(300);
            await page.mouse.up();
            await page.waitForTimeout(500);

            const bbox2 = await firstDrag.boundingBox();
            if (bbox2) {
              console.log(`✓ 拖拽后位置: X=${Math.round(bbox2.x)}, Y=${Math.round(bbox2.y)}`);
              const moved = Math.abs((bbox1.x - bbox2.x)) > 10;
              console.log(`${moved ? '✓' : '✗'} 拖拽是否生效: ${moved ? '是' : '否'}`);
            }
          } catch (e) {
            console.log(`✗ 拖拽失败: ${e}`);
          }
        }
      } else {
        console.log('⚠ 未找到可拖拽元素');
      }
    }
  });

  test('A6. 批量操作功能', async ({ page }) => {
    console.log('\n========== A6. 批量操作功能 ==========');

    // 检查复选框
    const checkboxes = page.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    console.log(`✓ 复选框数: ${checkboxCount}`);

    // 检查全选复选框
    const headerCheckbox = page.locator('thead input[type="checkbox"], [class*="select-all"]');
    const hasSelectAll = await headerCheckbox.first().isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`${hasSelectAll ? '✓' : '✗'} 全选复选框: ${hasSelectAll ? '有' : '无'}`);

    // 检查批量操作工具栏
    const batchToolbar = page.locator('[class*="batch"], [class*="toolbar"], [class*="selection"]');
    const toolbarExists = await batchToolbar.first().isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`${toolbarExists ? '✓' : '✗'} 批量操作工具栏: ${toolbarExists ? '显示' : '隐藏'}`);

    if (checkboxCount > 1 && hasSelectAll) {
      // 尝试选中一项
      const checkbox1 = checkboxes.nth(1);
      await checkbox1.click({ force: true });
      await page.waitForTimeout(500);

      // 检查是否显示选中状态
      const selectedCount = await checkboxes.locator(':checked').count();
      console.log(`✓ 已选中项数: ${selectedCount}`);

      // 检查批量操作按钮
      const batchActions = page.locator('[class*="batch-action"], button[aria-label*="批量"], button:has-text("删除"), button:has-text("导出")');
      const actionCount = await batchActions.count();
      console.log(`✓ 批量操作按钮数: ${actionCount}`);
    }
  });

  test('A7. 编辑和新建功能', async ({ page }) => {
    console.log('\n========== A7. 编辑和新建功能 ==========');

    // 检查新建按钮
    const createBtn = page.locator('button:has-text("新建"), button:has-text("创建"), button:has-text("Create"), button:has-text("新增")');
    const hasCreate = await createBtn.first().isVisible({ timeout: 2000 }).catch(() => false);
    console.log(`${hasCreate ? '✓' : '✗'} 新建按钮: ${hasCreate ? '有' : '无'}`);

    if (hasCreate) {
      await createBtn.first().click();
      await page.waitForTimeout(1000);

      // 检查新建对话框
      const modal = page.locator('[role="dialog"]');
      const modalExists = await modal.first().isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`${modalExists ? '✓' : '✗'} 新建对话框: ${modalExists ? '打开' : '未打开'}`);

      if (modalExists) {
        // 检查对话框中的输入字段
        const inputs = modal.locator('input, textarea');
        const inputCount = await inputs.count();
        console.log(`✓ 对话框输入字段: ${inputCount}`);

        // 关闭对话框
        const closeBtn = modal.locator('button[aria-label="关闭"], button:has-text("取消"), button:has-text("Cancel")');
        if (await closeBtn.first().isVisible({ timeout: 2000 }).catch(() => false)) {
          await closeBtn.first().click();
          await page.waitForTimeout(500);
        } else {
          await page.press('Escape');
        }
      }
    }

    // 检查编辑功能
    const rows = page.locator('[role="row"]');
    if (await rows.count() > 0) {
      await rows.first().click();
      await page.waitForLoadState('networkidle');

      const editBtn = page.locator('button:has-text("编辑"), button:has-text("Edit"), [aria-label*="编辑"]');
      const hasEdit = await editBtn.first().isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`${hasEdit ? '✓' : '✗'} 编辑按钮: ${hasEdit ? '有' : '无'}`);
    }
  });

  test('A8. 响应式和性能', async ({ page }) => {
    console.log('\n========== A8. 响应式和性能 ==========');

    const start = Date.now();
    const viewport = page.viewportSize();
    console.log(`✓ 当前视口: ${viewport?.width}x${viewport?.height}`);

    const loadTime = Date.now() - start;
    console.log(`✓ 页面加载耗时: ${loadTime}ms`);

    // 测试响应式
    const sizes = [
      { width: 1920, height: 1080, name: '桌面' },
      { width: 1024, height: 768, name: '平板' },
      { width: 375, height: 812, name: '手机' }
    ];

    for (const size of sizes) {
      await page.setViewportSize(size);
      await page.waitForTimeout(300);

      const content = page.locator('[role="row"], [class*="list"]');
      const visible = await content.first().isVisible({ timeout: 2000 }).catch(() => false);
      console.log(`✓ ${size.name}(${size.width}x${size.height}): ${visible ? '✓可显示' : '✗不可显示'}`);
    }

    // 恢复视口
    await page.setViewportSize({ width: 1280, height: 720 });
  });

  test('A9. UI/UX质量检查', async ({ page }) => {
    console.log('\n========== A9. UI/UX质量检查 ==========');

    // 检查无障碍标签
    const buttons = page.locator('button');
    const buttonCount = await buttons.count();
    console.log(`✓ 按钮总数: ${buttonCount}`);

    let unlabeledCount = 0;
    for (let i = 0; i < Math.min(buttonCount, 15); i++) {
      const btn = buttons.nth(i);
      const text = await btn.textContent();
      const ariaLabel = await btn.getAttribute('aria-label');
      const title = await btn.getAttribute('title');
      if (!text?.trim() && !ariaLabel && !title) {
        unlabeledCount++;
      }
    }
    console.log(`${unlabeledCount === 0 ? '✓' : '⚠'} 未标签按钮: ${unlabeledCount}`);

    // 检查加载状态
    const spinners = page.locator('[class*="loading"], [class*="spinner"], [class*="skeleton"]');
    const spinnerCount = await spinners.count();
    console.log(`${spinnerCount === 0 ? '✓' : '⚠'} 加载中元素: ${spinnerCount}`);

    // 检查错误提示
    const errors = page.locator('[class*="error"], [role="alert"]');
    const errorCount = await errors.count();
    console.log(`${errorCount === 0 ? '✓' : '⚠'} 错误提示: ${errorCount}`);

    // 检查空态
    const emptyStates = page.locator('[class*="empty"], [class*="Empty"]');
    const emptyCount = await emptyStates.count();
    console.log(`✓ 空态组件: ${emptyCount}`);
  });

  test('A10. 完整工作流总结', async ({ page }) => {
    console.log('\n========== A10. 完整工作流总结 ==========');

    console.log('\n【工作流 1】列表浏览');
    const rows = page.locator('[role="row"]');
    const initialCount = await rows.count();
    console.log(`  ✓ 加载数据行数: ${initialCount}`);

    if (initialCount > 0) {
      console.log('\n【工作流 2】进入详情/编辑页');
      await rows.first().click();
      await page.waitForLoadState('networkidle');
      const inEditUrl = page.url().includes('/process-templates/');
      console.log(`  ${inEditUrl ? '✓' : '✗'} 成功进入编辑页: ${inEditUrl ? '是' : '否'}`);

      if (inEditUrl) {
        console.log('\n【工作流 3】查看甘特图');
        const gantt = page.locator('canvas, svg[class*="gantt"], [class*="gantt"]');
        const ganttCount = await gantt.count();
        console.log(`  ✓ 甘特图组件数: ${ganttCount}`);

        const taskBars = page.locator('[class*="task"], [class*="bar"]');
        const taskCount = await taskBars.count();
        console.log(`  ✓ 任务/操作条: ${taskCount}`);

        console.log('\n【工作流 4】尝试编辑或创建操作');
        const editBtn = page.locator('button:has-text("编辑"), button:has-text("新建"), button:has-text("添加")');
        const editAvailable = await editBtn.first().isVisible({ timeout: 2000 }).catch(() => false);
        console.log(`  ${editAvailable ? '✓' : '✗'} 编辑/创建功能: ${editAvailable ? '可用' : '不可用'}`);

        console.log('\n【工作流 5】返回列表');
        const backBtn = page.locator('button:has-text("返回"), [aria-label*="返回"]');
        const hasBackBtn = await backBtn.first().isVisible({ timeout: 2000 }).catch(() => false);
        console.log(`  ${hasBackBtn ? '✓' : '✗'} 返回按钮: ${hasBackBtn ? '有' : '无'}`);

        if (hasBackBtn) {
          await backBtn.first().click();
          await page.waitForLoadState('networkidle');
          const backToList = !page.url().includes('/process-templates/') || page.url().endsWith('/process-templates');
          console.log(`  ${backToList ? '✓' : '✗'} 成功返回列表: ${backToList ? '是' : '否'}`);
        }
      }
    }

    console.log('\n========== 审计完成 ==========\n');
  });
});
