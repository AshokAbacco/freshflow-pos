-- Lets the platform answer a store, instead of only marking its message handled.
--
-- Until now the conversation was one-way plus a tick: a shop could write in, and support could
-- say "dealt with", but there was no way to actually tell them anything back. The shop saw
-- silence.
--
-- A reply from support is an ordinary platform_messages row aimed at that one store, so it
-- travels the path that already works -- it lands in their app, shows in their notifications,
-- and they can answer it again. The only new thing is a link back to the message being
-- answered, so both sides can show the thread in order.
--
-- Safe to run twice.

ALTER TABLE "platform_messages"
    ADD COLUMN IF NOT EXISTS "in_reply_to_id" TEXT;

-- SET NULL rather than CASCADE: deleting a store's message must never delete the answer that
-- was sent about it, which is part of the support record.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'platform_messages_in_reply_to_fkey'
    ) THEN
        ALTER TABLE "platform_messages"
            ADD CONSTRAINT "platform_messages_in_reply_to_fkey"
            FOREIGN KEY ("in_reply_to_id")
            REFERENCES "store_message_replies"("id")
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS "platform_messages_in_reply_to_idx"
    ON "platform_messages" ("in_reply_to_id");

-- A direct reply is addressed to one shop, so it should not appear in the broadcast list
-- alongside campaigns sent to everyone. This marks them apart.
ALTER TABLE "platform_messages"
    ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'BROADCAST';

CREATE INDEX IF NOT EXISTS "platform_messages_kind_idx"
    ON "platform_messages" ("kind", "created_at" DESC);