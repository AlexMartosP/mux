ALTER TABLE agents ADD COLUMN repository_id TEXT REFERENCES repositories(id);
