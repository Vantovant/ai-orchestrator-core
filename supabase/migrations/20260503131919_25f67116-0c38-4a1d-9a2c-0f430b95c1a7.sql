-- Step 5G-D part 1: extend app_role enum with governance_reviewer
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'governance_reviewer';