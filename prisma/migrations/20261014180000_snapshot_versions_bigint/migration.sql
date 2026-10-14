-- AlterTable
ALTER TABLE "config_sync_audits" ALTER COLUMN "configuration_version" SET DATA TYPE BIGINT,
ALTER COLUMN "access_version" SET DATA TYPE BIGINT;

-- AlterTable
ALTER TABLE "local_installation" ALTER COLUMN "last_configuration_version" SET DATA TYPE BIGINT,
ALTER COLUMN "last_access_version" SET DATA TYPE BIGINT;
