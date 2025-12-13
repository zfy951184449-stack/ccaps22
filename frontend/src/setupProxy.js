const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function setupProxy(app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:3001',
      changeOrigin: true,
    }),
  );

  app.use(
    '/solver-api',
    createProxyMiddleware({
      target: 'http://localhost:5005',
      changeOrigin: true,
      pathRewrite: {
        '^/solver-api': '/api',
      },
    }),
  );
};
