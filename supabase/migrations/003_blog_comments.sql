-- Blog comments & Q&A table
CREATE TABLE IF NOT EXISTS blog_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  article_slug TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  content TEXT NOT NULL,
  is_question BOOLEAN DEFAULT false,
  parent_id UUID REFERENCES blog_comments(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blog_comments_slug ON blog_comments(article_slug);
CREATE INDEX IF NOT EXISTS idx_blog_comments_parent ON blog_comments(parent_id);

ALTER TABLE blog_comments ENABLE ROW LEVEL SECURITY;

-- Anyone can read comments
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='blog_comments' AND policyname='Public read') THEN
    CREATE POLICY "Public read" ON blog_comments FOR SELECT USING (true);
  END IF;
END $$;

-- Authenticated users can insert
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='blog_comments' AND policyname='Auth insert') THEN
    CREATE POLICY "Auth insert" ON blog_comments FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- Users can delete their own comments
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='blog_comments' AND policyname='Own delete') THEN
    CREATE POLICY "Own delete" ON blog_comments FOR DELETE USING (auth.uid() = user_id);
  END IF;
END $$;
