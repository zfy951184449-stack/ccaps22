"""
回调鉴权回归测试。

验证 solver→backend 的回调在三处都带上 header X-Solver-Callback-Token
（值取自 env SOLVER_CALLBACK_SECRET），供 backend 的 requireServiceAuth 校验：
  1. 进度 POST   (push_progress)
  2. 结果 POST   (_push_result_summary)
  3. status 轮询 GET (poll_server_stop)  —— status 路由在 backend 同样挂了 requireServiceAuth
并验证未配置密钥时不带该 header（保持旧行为，由 backend 决定 401/503）。

运行：
  cd solver_v4 && python3 -m unittest tests.test_callback_auth
"""
import os
import unittest
from unittest.mock import patch, MagicMock

from core.callback import APICallback

PROGRESS_URL = "http://localhost:3001/api/v4/scheduling/callback/progress"
SECRET = "test-secret-deadbeef"


def _build_callback(secret):
    """构造 APICallback；__init__ 在构造时读取 env，故先设好再构造。
    secret=None 表示 env 中不存在 SOLVER_CALLBACK_SECRET。"""
    overrides = {} if secret is None else {"SOLVER_CALLBACK_SECRET": secret}
    with patch.dict(os.environ, overrides, clear=False):
        if secret is None:
            os.environ.pop("SOLVER_CALLBACK_SECRET", None)
        return APICallback(run_id="123", api_url=PROGRESS_URL)


class TestCallbackAuthHeader(unittest.TestCase):

    def test_progress_post_sends_token(self):
        cb = _build_callback(SECRET)
        with patch("core.callback.requests.post") as mock_post:
            cb.push_progress(status="RUNNING", log_line="hi", type="LOG")
            self.assertTrue(mock_post.called)
            headers = mock_post.call_args.kwargs.get("headers", {})
            self.assertEqual(headers.get("X-Solver-Callback-Token"), SECRET)

    def test_result_post_sends_token_to_result_url(self):
        cb = _build_callback(SECRET)
        with patch("core.callback.requests.post") as mock_post:
            mock_post.return_value = MagicMock(status_code=200)
            cb._push_result_summary({"status": "OPTIMAL", "metrics": {}})
            self.assertTrue(mock_post.called)
            headers = mock_post.call_args.kwargs.get("headers", {})
            self.assertEqual(headers.get("X-Solver-Callback-Token"), SECRET)
            # 结果应 POST 到 /callback/result（而非 /callback/progress）
            url = mock_post.call_args.args[0]
            self.assertTrue(url.endswith("/callback/result"), f"unexpected result url: {url}")

    def test_status_poll_get_sends_token(self):
        cb = _build_callback(SECRET)
        with patch("core.callback.requests.get") as mock_get:
            resp = MagicMock(status_code=200)
            resp.json.return_value = {"data": {"status": "RUNNING"}}
            mock_get.return_value = resp
            cb.poll_server_stop()
            self.assertTrue(mock_get.called)
            headers = mock_get.call_args.kwargs.get("headers", {})
            self.assertEqual(headers.get("X-Solver-Callback-Token"), SECRET)

    def test_missing_secret_omits_token_header(self):
        cb = _build_callback(None)
        with patch("core.callback.requests.post") as mock_post:
            cb.push_progress(status="RUNNING", log_line="hi", type="LOG")
            self.assertTrue(mock_post.called)
            headers = mock_post.call_args.kwargs.get("headers", {})
            self.assertNotIn("X-Solver-Callback-Token", headers)


if __name__ == "__main__":
    unittest.main()
