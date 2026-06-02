import { test, expect } from '@playwright/test';

test.describe('工艺模版甘特图界面审计', () => {
  test.beforeEach(async ({ page }) => {
    // 访问应用
    await page.goto('http://localhost:3000');
    // 等待应用加载
    await page.waitForLoadState('networkidle');
  });

  test('导航到工艺模版列表页面', async ({ page }) => {
    // 查找并点击工艺模版相关的导航链接
    const link = page.getByRole('link').filter({ hasText: /模板|Template|工艺/ });
    if (await link.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await link.first().click();
      await page.waitForLoadState('networkidle');
    }

    // 验证页面加载
    expect(page.url()).toContain('process-template');
  });

  test('查看甘特图列表和操作', async ({ page }) => {
    // 导航到工艺模版
    await page.goto('http://localhost:3000/process-template');
    await page.waitForLoadState('networkidle');

    // 等待列表加载
    await page.waitForTimeout(1000);

    // 检查列表是否存在
    const list = page.locator('[class*="list"], [class*="List"]');
    const listVisible = await list.first().isVisible({ timeout: 5000 }).catch(() => false);
    console.log('列表是否可见:', listVisible);

    // 获取所有模板项
    const items = page.locator('[class*="row"], [class*="item"], [role="row"]');
    const count = await items.count();
    console.log('列表项数量:', count);

    if (count > 0) {
      // 点击第一个模板进入详情/编辑页面
      await items.first().click();
      await page.waitForLoadState('networkidle');
      console.log('成功点击第一个模板项，当前URL:', page.url());
    }
  });

  test('甘特图显示和交互测试', async ({ page }) => {
    await page.goto('http://localhost:3000/process-template');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 尝试查找甘特图组件
    const ganttContainer = page.locator('[class*="gantt"], [class*="Gantt"], canvas, svg');
    const ganttVisible = await ganttContainer.first().isVisible({ timeout: 5000 }).catch(() => false);
    console.log('甘特图组件可见:', ganttVisible);

    // 查找操作行或任务条
    const taskBars = page.locator('[class*="task"], [class*="bar"], [class*="operation"]');
    const taskCount = await taskBars.count();
    console.log('操作/任务条数量:', taskCount);
  });

  test('拖拽功能测试', async ({ page }) => {
    await page.goto('http://localhost:3000/process-template');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 找到可拖拽的元素
    const draggableItems = page.locator('[draggable="true"], [class*="drag"], [class*="Drag"]');
    const draggableCount = await draggableItems.count();
    console.log('可拖拽元素数量:', draggableCount);

    if (draggableCount > 0) {
      const firstDraggable = draggableItems.first();
      const bbox = await firstDraggable.boundingBox();

      if (bbox) {
        console.log('拖拽测试 - 元素位置:', bbox);
        // 尝试拖拽
        try {
          await firstDraggable.dragTo(page.locator('body'));
          console.log('拖拽成功');
        } catch (e) {
          console.log('拖拽失败:', e);
        }
      }
    }
  });

  test('批量操作功能测试', async ({ page }) => {
    await page.goto('http://localhost:3000/process-template');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 查找复选框/批量选择
    const checkboxes = page.locator('input[type="checkbox"]');
    const checkboxCount = await checkboxes.count();
    console.log('复选框数量:', checkboxCount);

    // 查找批量操作按钮
    const batchButtons = page.locator('[class*="batch"], [class*="bulk"], button:has-text("批量"), button:has-text("Delete"), button:has-text("删除")');
    const batchButtonCount = await batchButtons.count();
    console.log('批量操作按钮数量:', batchButtonCount);

    // 查找工具栏
    const toolbar = page.locator('[class*="toolbar"], [class*="Toolbar"], [class*="header"]');
    const toolbarVisible = await toolbar.first().isVisible({ timeout: 5000 }).catch(() => false);
    console.log('工具栏可见:', toolbarVisible);
  });

  test('表单和编辑功能测试', async ({ page }) => {
    await page.goto('http://localhost:3000/process-template');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 查找编辑按钮
    const editButtons = page.locator('button:has-text("编辑"), button:has-text("Edit"), [class*="edit"]');
    const editCount = await editButtons.count();
    console.log('编辑按钮数量:', editCount);

    // 查找模态框或表单
    const modals = page.locator('[role="dialog"], [class*="modal"], [class*="Modal"]');
    const modalCount = await modals.count();
    console.log('模态框数量:', modalCount);

    // 查找表单输入
    const inputs = page.locator('input, textarea, select');
    const inputCount = await inputs.count();
    console.log('表单输入元素数量:', inputCount);
  });

  test('性能和响应性测试', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('http://localhost:3000/process-template');
    const navigationTime = Date.now() - startTime;
    console.log('页面导航耗时:', navigationTime, 'ms');

    await page.waitForLoadState('networkidle');
    const loadTime = Date.now() - startTime;
    console.log('页面完全加载耗时:', loadTime, 'ms');

    // 检查是否有性能警告或错误
    const errors = await page.evaluate(() => {
      return (window as any).console.errors || [];
    });
    console.log('控制台错误数:', errors.length);
  });

  test('导出/下载功能测试', async ({ page }) => {
    await page.goto('http://localhost:3000/process-template');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);

    // 查找导出/下载按钮
    const exportButtons = page.locator('button:has-text("导出"), button:has-text("下载"), button:has-text("Export"), button:has-text("Download")');
    const exportCount = await exportButtons.count();
    console.log('导出/下载按钮数量:', exportCount);

    // 查找菜单或更多选项
    const moreButtons = page.locator('button:has-text("更多"), button:has-text("..."), [class*="menu"]');
    const moreCount = await moreButtons.count();
    console.log('更多选项按钮数量:', moreCount);
  });

  test('完整工作流测试 - 创建和编辑流程', async ({ page }) => {
    await page.goto('http://localhost:3000/process-template');
    await page.waitForLoadState('networkidle');

    console.log('\n=== 完整工作流测试 ===');

    // 1. 检查列表页面元素
    const createButton = page.locator('button:has-text("新建"), button:has-text("Create"), button:has-text("创建")');
    if (await createButton.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('✓ 找到创建按钮');
      // 点击创建
      await createButton.first().click();
      await page.waitForLoadState('networkidle');
      console.log('✓ 已点击创建按钮，URL:', page.url());
    } else {
      console.log('✗ 未找到创建按钮');
    }

    // 2. 尝试列表交互
    const items = page.locator('[role="row"], [class*="item"], li');
    const itemCount = await items.count();
    if (itemCount > 0) {
      console.log('✓ 列表中有', itemCount, '项');
      // 点击第一项
      try {
        await items.first().click();
        await page.waitForLoadState('networkidle');
        console.log('✓ 成功进入详情页面');
      } catch {
        console.log('✗ 进入详情页面失败');
      }
    }
  });

  test('用户体验细节检查', async ({ page }) => {
    await page.goto('http://localhost:3000/process-template');
    await page.waitForLoadState('networkidle');

    console.log('\n=== 用户体验细节 ===');

    // 检查搜索功能
    const searchInput = page.locator('input[placeholder*="搜索"], input[placeholder*="Search"], input[class*="search"]');
    const hasSearch = await searchInput.first().isVisible({ timeout: 3000 }).catch(() => false);
    console.log('✓ 搜索功能:', hasSearch ? '可用' : '未找到');

    // 检查排序功能
    const sortButtons = page.locator('[class*="sort"], button:has-text("排序")');
    const sortCount = await sortButtons.count();
    console.log('✓ 排序功能:', sortCount > 0 ? '可用' : '未找到');

    // 检查筛选功能
    const filterButtons = page.locator('[class*="filter"], button:has-text("筛选")');
    const filterCount = await filterButtons.count();
    console.log('✓ 筛选功能:', filterCount > 0 ? '可用' : '未找到');

    // 检查分页
    const pagination = page.locator('[class*="pagination"], [class*="pager"]');
    const hasPagination = await pagination.first().isVisible({ timeout: 3000 }).catch(() => false);
    console.log('✓ 分页功能:', hasPagination ? '可用' : '未找到');

    // 检查响应式布局
    const windowSize = await page.viewportSize();
    console.log('✓ 当前窗口大小:', windowSize);
  });
});
