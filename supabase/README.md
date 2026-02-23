# Supabase Schema

This folder contains SQL migrations for the Outputs To Outcomes app.

## Files

- `migrations/20260223130000_init_schema.sql`: initial v1 schema, RLS policies, helper functions, and RPCs.

## RPCs in v1

- `get_daily_dashboard(p_target_date date)`
- `purge_my_data()`
