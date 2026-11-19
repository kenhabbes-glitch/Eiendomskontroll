-- 031: Chat per leietaker – meldinger vises umiddelbart (sanntid). Tilgangen styres fortsatt av radnivåsikkerheten:
-- leietaker mottar bare meldinger som er delt med dem.
do $$ begin
  begin execute 'alter publication supabase_realtime add table public.meldinger'; exception when duplicate_object or undefined_object then null; end;
  begin execute 'alter publication supabase_realtime add table public.meldingsdeltakere'; exception when duplicate_object or undefined_object then null; end;
end $$;
