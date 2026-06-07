DROP TABLE IF EXISTS `x_analyses`;
--> statement-breakpoint
DROP TABLE IF EXISTS `x_likes`;
--> statement-breakpoint
DELETE FROM `app_config`
WHERE `key` IN (
  'x_client_id',
  'x_client_secret',
  'x_access_token',
  'x_refresh_token'
);
