// 测试v4版本的dryRun功能
async function testDryRun() {
  const baseUrl = 'http://localhost:3000/api/scheduling';

  console.log('测试v4版本的试运行功能...\n');

  // 测试正式运行
  console.log('1. 测试正式运行 (dryRun=false):');
  try {
    const response = await fetch(`${baseUrl}/auto-plan/v4`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        batchIds: [1],
        options: {
          dryRun: false,
          adaptiveParams: true,
          earlyStop: true
        }
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    console.log('✓ 正式运行结果:', {
      message: data.message,
      runStatus: data.run?.status,
      logsCount: data.logs?.length
    });
  } catch (error) {
    console.log('✗ 正式运行失败:', error.message);
  }

  console.log('\n2. 测试试运行 (dryRun=true):');
  try {
    const response = await fetch(`${baseUrl}/auto-plan/v4`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        batchIds: [1],
        options: {
          dryRun: true,
          adaptiveParams: true,
          earlyStop: true
        }
      })
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }
    console.log('✓ 试运行结果:', {
      message: data.message,
      runStatus: data.run?.status,
      logsCount: data.logs?.length
    });

    // 检查日志中是否包含试运行相关信息
    const hasDryRunLog = data.logs?.some(log =>
      log.includes('试运行') || log.includes('dry') || log.includes('跳过')
    );
    console.log('✓ 日志包含试运行信息:', hasDryRunLog);
  } catch (error) {
    console.log('✗ 试运行失败:', error.message);
  }

  console.log('\n测试完成！');
}

testDryRun().catch(console.error);
