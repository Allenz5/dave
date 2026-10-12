-- Search runs by hand for now, so the strategy keeps only the filter prompt.
alter table strategy drop column source, drop column frequency, drop column per_keyword;
