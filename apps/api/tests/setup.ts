process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'x'.repeat(32);
process.env.JWT_REFRESH_SECRET = 'y'.repeat(32);
process.env.PAYMENT_PROVIDER = 'development_mock';
process.env.PAYMENT_WEBHOOK_SECRET = 'payment-test-secret';
// Pinned so the suite never inherits a developer's local .env: dotenv does not
// override values already present, so anything set here wins.
process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = 'true';
process.env.PAGINATION_DEFAULT_LIMIT = '20';
process.env.PAGINATION_MAX_LIMIT = '100';
process.env.RATE_LIMIT_ENABLED = 'false';
process.env.LOG_LEVEL = 'fatal';