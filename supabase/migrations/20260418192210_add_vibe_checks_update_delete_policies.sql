create policy "Users can update their own vibe checks"
on public.vibe_checks
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete their own vibe checks"
on public.vibe_checks
for delete
to authenticated
using (auth.uid() = user_id);
