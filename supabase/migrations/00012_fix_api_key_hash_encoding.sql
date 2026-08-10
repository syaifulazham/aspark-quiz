-- Keys created before the encoding fix stored the base64 *text* of the hash as
-- bytea (44 bytes) instead of the raw 32-byte hash. Decode back to raw bytes so
-- existing keys keep working.
update api_keys
set key_hash = decode(convert_from(key_hash, 'UTF8'), 'base64')
where octet_length(key_hash) = 44;
