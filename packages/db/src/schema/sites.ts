import { sql } from 'drizzle-orm';
import {
  boolean,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { connectionTypeEnum, secretKindEnum, verificationMethodEnum } from './enums.js';
import { users } from './users.js';

export const sites = pgTable(
  'sites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    domain: text('domain').notNull(), // normalised, no protocol, no trailing slash
    connectionType: connectionTypeEnum('connection_type').notNull(),
    wpSiteUrl: text('wp_site_url'),
    verificationMethod: verificationMethodEnum('verification_method'),
    verificationToken: text('verification_token').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    gscConnected: boolean('gsc_connected').notNull().default(false),
    gscProperty: text('gsc_property'),
    // Autopilot (Epic 21) — optional Google Analytics 4 + Business Profile links.
    ga4Property: text('ga4_property'),
    gbpLocation: text('gbp_location'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('sites_user_domain_uq').on(t.userId, t.domain)],
);

/**
 * Encrypted secrets (AES-256-GCM). One row per (site, kind).
 * Encrypt/decrypt via `encryptSecret` / `decryptSecret` in `packages/shared`.
 */
export const siteSecrets = pgTable(
  'site_secrets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    kind: secretKindEnum('kind').notNull(),
    ciphertext: text('ciphertext').notNull(),
    iv: text('iv').notNull(),
    tag: text('tag').notNull(),
    meta: jsonb('meta').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('site_secrets_site_kind_uq').on(t.siteId, t.kind)],
);

export type SiteRow = typeof sites.$inferSelect;
export type NewSiteRow = typeof sites.$inferInsert;
export type SiteSecretRow = typeof siteSecrets.$inferSelect;
