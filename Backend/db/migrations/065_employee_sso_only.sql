-- Employee accounts in the standalone app are identities, not password accounts.
-- The technical root account is intentionally excluded because it protects admin settings.
UPDATE users
SET password_hash = 'SSO_ONLY_' || md5(id::text || clock_timestamp()::text || random()::text),
    must_change_password = FALSE,
    password_changed_at = NULL
WHERE is_root = FALSE;
