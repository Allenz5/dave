-- Channel URLs carry this random id, so they can't be guessed by counting
alter table channels add column public_id uuid not null default gen_random_uuid() unique;
