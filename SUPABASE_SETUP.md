# Supabase Setup Guide: PMK ITERA Open Recruitment Portal

This guide will walk you through setting up Supabase for your Open Recruitment Portal. Have this guide handy when configuring your new project.

## 1. Create a Supabase Project
1. Go to [database.new](https://database.new/) or log into your [Supabase Dashboard](https://supabase.com/dashboard).
2. Click **New Project** and select your organization.
3. Name the project `PMK ITERA Recruitment` (or similar).
4. Create a strong database password and select a region closest to your users (e.g., Singapore).
5. Click **Create new project**. It will take a few minutes to provision the database.

## 2. Environment Variables Integration
Once your project is created, you need to link it to your Next.js application.

1. Go to **Project Settings** (the gear icon on the left sidebar).
2. Click **API** under the Configuration section.
3. Here you will find your `Project URL` and `Project API Keys` (look for the `anon` `public` key).
4. In your code editor, create a `.env.local` file in the root of your project (`pmk-oprec/`) if it doesn't already exist.
5. Add these values:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your-project-url-here
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
   ```

## 3. SQL Migration Script
Now we need to create the tables, indexes, and security policies. 

1. Go to the **SQL Editor** on the left sidebar in Supabase.
2. Click **New Query**.
3. Copy the entire SQL block below and paste it into the editor.
4. Click **Run** (or press `Cmd/Ctrl + Enter`).

```sql
-- Enable UUID extension for unique identifiers
create extension if not exists "uuid-ossp";

-- ==========================================
-- 1. CREATE TABLES
-- ==========================================

-- RECRUITMENTS TABLE
create table public.recruitments (
  id uuid default uuid_generate_v4() primary key,
  title text not null,
  description text,
  slug text not null unique,
  is_open boolean default true,
  open_date timestamptz not null,
  close_date timestamptz not null,
  form_fields jsonb default '[]'::jsonb,
  template_type text,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- SUBMISSIONS TABLE
create table public.submissions (
  id uuid default uuid_generate_v4() primary key,
  recruitment_id uuid not null references public.recruitments(id) on delete cascade,
  applicant_name text not null,
  applicant_email text not null,
  applicant_nim text not null,
  answers jsonb default '{}'::jsonb,
  files jsonb,
  submitted_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- ==========================================
-- 2. INDEXES for Performance
-- ==========================================
create index idx_recruitments_slug on public.recruitments(slug);
create index idx_submissions_recruitment_id on public.submissions(recruitment_id);

-- ==========================================
-- 3. UPDATED_AT TRIGGERS
-- ==========================================
-- Function to automatically update the 'updated_at' timestamp
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- Trigger for recruitments
create trigger handle_recruitments_updated_at
  before update on public.recruitments
  for each row execute procedure public.handle_updated_at();

-- Trigger for submissions
create trigger handle_submissions_updated_at
  before update on public.submissions
  for each row execute procedure public.handle_updated_at();

-- ==========================================
-- 4. ROW LEVEL SECURITY (RLS) POLICIES
-- ==========================================

-- Enable RLS on both tables
alter table public.recruitments enable row level security;
alter table public.submissions enable row level security;

-- RECRUITMENTS POLICIES
-- Anyone (public) can view open recruitments
create policy "Public can view open recruitments"
  on public.recruitments for select
  using (is_open = true);

-- Admins (authenticated) can view ALL recruitments (including closed ones)
create policy "Admins can view all recruitments"
  on public.recruitments for select
  to authenticated
  using (true);

-- Admins (authenticated) can insert/update/delete recruitments
create policy "Admins can insert recruitments"
  on public.recruitments for insert
  to authenticated
  with check (true);

create policy "Admins can update recruitments"
  on public.recruitments for update
  to authenticated
  using (true)
  with check (true);

create policy "Admins can delete recruitments"
  on public.recruitments for delete
  to authenticated
  using (true);

-- SUBMISSIONS POLICIES
-- Anyone (public/anon) can submit an application
create policy "Public can submit applications"
  on public.submissions for insert
  to anon, authenticated
  with check (true);

-- Only Admins (authenticated) can view submissions
create policy "Admins can view submissions"
  on public.submissions for select
  to authenticated
  using (true);

-- Only Admins (authenticated) can delete submissions
create policy "Admins can delete submissions"
  on public.submissions for delete
  to authenticated
  using (true);

-- Only Admins (authenticated) can update submissions (optional)
create policy "Admins can update submissions"
  on public.submissions for update
  to authenticated
  using (true)
  with check (true);
```

To verify the tables were created successfully, go to the **Table Editor** on the left sidebar. You should see both `recruitments` and `submissions` listed.

## 4. Storage Bucket Setup
The application needs a place to store files uploaded by the applicants (e.g., CVs, photos). 

*Note: Since the public form handles uploads directly before submission, the bucket needs to allow anonymous (public) uploads. The script below configures this correctly based on the app's architecture.*

1. Go to the **SQL Editor** again.
2. Paste the following snippet and run it:

```sql
-- Create the recruitment-files bucket and set it to public
insert into storage.buckets (id, name, public) 
values ('recruitment-files', 'recruitment-files', true);

-- Enable RLS on storage.objects
alter table storage.objects enable row level security;

-- Allow public (anon) and authenticated users to upload files
create policy "Anyone can upload files"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'recruitment-files');

-- Allow anyone to read files (required because getPublicUrl is used to view assets)
create policy "Anyone can view files"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'recruitment-files');

-- Only Admins can delete or update files
create policy "Admins can delete files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'recruitment-files');

create policy "Admins can update files"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'recruitment-files');
```
*You can also verify this by checking the **Storage** menu on the left sidebar in Supabase to see if the `recruitment-files` bucket exists.*

## 5. Authentication Setup (Creating Admin)
We need to create the very first admin account so you can log into the dashboard securely.

1. Go to **Authentication** -> **Users** from the left sidebar.
2. Click the **Add User** -> **Create New User** button on the top right.
3. Enter your PMK admin email (e.g., `admin@pmkitera.com`) and a strong, memorable password.
4. Uncheck "Auto Confirm User" if you prefer to verify via email, but the easiest way is to leave it checked or manually verify the user directly in the dashboard by clicking "Confirm email address" from the user options after creation.
5. Next, run your local development server with `npm run dev` and navigate to `http://localhost:3000/admin/login`.
6. Try logging in with these exact credentials.

### (Optional) Restricting Login
To ensure only authorized emails can sign in or sign up, you can disable public sign-ups:
1. Go to **Authentication** -> **Providers**.
2. Expand the **Email** provider box.
3. Toggle "Confirm email" if you wish, but more importantly, verify that in **Authentication** -> **Settings**, the option for "Allow new users to sign up" can be turned **off**. (If you turn this off, no one can sign up from their browser. You must manually add admins from the Supabase dashboard like you just did).

---

**That's it! 🎉** Your fully managed Supabase database, secure file storage, and authenticated backend are now integrated and enforcing rules perfectly.
