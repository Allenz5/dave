insert into channels (slug, name, description, created_at) values
  ('chat', 'chat', 'A place to talk about interesting things you came across. Be kind, and share freely.', now() - interval '120 days');

insert into posts (channel_id, author_name, title, body, image_url, score, created_at) values
  ((select id from channels where slug = 'chat'), 'fawn_walks', 'Found this little cafe corner on my walk today', 'Tucked away down a side street. Nobody was there, so I just sat for an hour.', 'https://picsum.photos/seed/cat/800/500', 342, now() - interval '3 hours'),
  ((select id from channels where slug = 'chat'), 'zhe_codes', 'Anyone else sleep until the afternoon every weekend?', 'Set three alarms and turned off every one of them in my sleep. Woke up at 2:30pm and the day was just gone.', null, 128, now() - interval '5 hours'),
  ((select id from channels where slug = 'chat'), 'evening_breeze', 'Sharing a photo I just took', '', 'https://picsum.photos/seed/sunset/800/600', 517, now() - interval '9 hours'),
  ((select id from channels where slug = 'chat'), 'momo', 'Book recommendation: Thinking, Fast and Slow', 'It explains how we make decisions and all the ways our intuition misleads us. Very readable even without a psychology background. I notice my own biases everywhere now.', null, 86, now() - interval '1 day'),
  ((select id from channels where slug = 'chat'), 'old_zhou', 'First attempt at caramel, total disaster', 'Burned the sugar and the whole pot turned bitter. How do you actually know when to take it off the heat?', null, 64, now() - interval '2 days'),
  ((select id from channels where slug = 'chat'), 'kiki', 'What is the most useful productivity tool you have ever used?', 'I will go first: my calendar. Everything goes on the calendar. If it is not on the calendar, it does not exist.', null, 203, now() - interval '3 days');

insert into posts (channel_id, author_name, title, embed_provider, embed_id, score, created_at) values
  ((select id from channels where slug = 'chat'), 'zhe_codes', 'Where it all started', 'x', '20', 412, now() - interval '1 hour'),
  ((select id from channels where slug = 'chat'), 'kiki', null, 'youtube', 'jNQXAC9IVRw', 275, now() - interval '2 hours'),
  ((select id from channels where slug = 'chat'), 'momo', null, 'x', '440322224407314432', 158, now() - interval '6 hours'),
  ((select id from channels where slug = 'chat'), 'old_zhou', 'You know the rules and so do I', 'youtube', 'dQw4w9WgXcQ', 99, now() - interval '12 hours'),
  ((select id from channels where slug = 'chat'), 'evening_breeze', null, 'x', '266031293945503744', 61, now() - interval '4 days');

insert into comments (post_id, parent_id, author_name, body, score, created_at) values
  (1, null, 'zhe_codes', 'This looks like the kind of place that serves amazing coffee and nobody knows about it', 88, now() - interval '2 hours'),
  (1, 1,    'fawn_walks', 'Exactly that. Please do not tell anyone', 41, now() - interval '110 minutes'),
  (1, 2,    'momo', 'Too late, I am already planning a trip', 17, now() - interval '100 minutes'),
  (1, null, 'kiki', 'Love the light in this. Where is it?', 12, now() - interval '90 minutes'),
  (2, null, 'old_zhou', 'If you never set an alarm, an alarm can never wake you up. I choose not to set one', 30, now() - interval '4 hours'),
  (2, 5,    'zhe_codes', 'This is genius-level logic', 9, now() - interval '3 hours'),
  (3, null, 'zhe_codes', 'The colors are incredible. Where did you take this?', 25, now() - interval '8 hours'),
  (3, 7,    'evening_breeze', 'Near my place, on the walk home from work', 14, now() - interval '7 hours'),
  (5, null, 'momo', 'Low heat, and the moment it turns amber take it off. One second too late and it is bitter', 47, now() - interval '1 day'),
  (5, 9,    'old_zhou', 'Good to know, will try again', 6, now() - interval '20 hours'),
  (5, null, 'kiki', 'Adding a splash of water at the start makes it much more forgiving', 22, now() - interval '1 day'),
  (6, null, 'evening_breeze', 'Notes app plus a pomodoro timer. Simple and it works', 33, now() - interval '2 days'),
  (6, null, 'fawn_walks', 'Calendar person here too, but I break every task into half-hour blocks', 19, now() - interval '2 days');

insert into comments (post_id, parent_id, author_name, body, score, created_at) values
  (7, null, 'momo', 'The first post ever. Feels like a museum piece', 21, now() - interval '50 minutes'),
  (8, null, 'fawn_walks', 'The first video ever uploaded, and it is about elephant trunks', 34, now() - interval '100 minutes');
