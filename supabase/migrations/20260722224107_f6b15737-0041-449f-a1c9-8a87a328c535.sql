-- Create allowed_emails table to manage authorized users and roles
CREATE TABLE public.allowed_emails (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('admin', 'viewer')),
  created_at timestamp with time zone DEFAULT now()
);

-- Grant access to authenticated users and service role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.allowed_emails TO authenticated;
GRANT ALL ON public.allowed_emails TO service_role;

-- Enable RLS
ALTER TABLE public.allowed_emails ENABLE ROW LEVEL SECURITY;

-- Users can only read their own allowed email row
CREATE POLICY "Users can read own allowed email"
ON public.allowed_emails
FOR SELECT
TO authenticated
USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));

-- Create access_logs table for tracking access attempts
CREATE TABLE public.access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  allowed boolean NOT NULL,
  ip_address text,
  created_at timestamp with time zone DEFAULT now()
);

-- Grant access to authenticated users and service role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.access_logs TO authenticated;
GRANT ALL ON public.access_logs TO service_role;

-- Enable RLS
ALTER TABLE public.access_logs ENABLE ROW LEVEL SECURITY;

-- Users can only read their own access logs
CREATE POLICY "Users can read own access logs"
ON public.access_logs
FOR SELECT
TO authenticated
USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()));
