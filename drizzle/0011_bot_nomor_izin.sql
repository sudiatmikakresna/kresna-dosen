-- Bot tanya-jawab WhatsApp hanya melayani nomor yang diizinkan dosen (bisa diubah di panel /dosen/whatsapp/bot).
INSERT INTO "pengaturan" ("kunci", "nilai") VALUES ('wa_bot_nomor_izin', '6281934374633') ON CONFLICT ("kunci") DO NOTHING;
