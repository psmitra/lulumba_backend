# Feed: how it works

This module serves every feed in the app. This page explains which posts
each feed shows, in what order, and why. All the numbers below live in
[`feed.constants.ts`](feed.constants.ts), so this page and that file must
change together.

## The six endpoints

All of them need a signed-in user (Bearer token) and return the usual
cursor page: `data` is a list of post cards (author, attachments, counts,
`isLiked`, `isSaved`, `isMine`) and `meta` is `{ limit, nextCursor, hasMore }`.

| Endpoint                | What it shows                                                     | Order                                 |
| ----------------------- | ----------------------------------------------------------------- | ------------------------------------- |
| `GET /feed/home`        | People you follow + your own posts, plus some discovery posts     | **Ranked**                            |
| `GET /feed/latest`      | Everything you are allowed to see. `?type=photo\|video\|document` | Newest first                          |
| `GET /feed/recommended` | Popular public posts from people you **don't** follow             | **Ranked**                            |
| `GET /feed/videos`      | Posts with a ready (playable) video                               | `?sort=latest` (default) or `popular` |
| `GET /feed/pictures`    | Posts with a ready photo                                          | `?sort=latest` (default) or `popular` |
| `GET /feed/documents`   | Posts with a ready document (the Scripts section)                 | `?sort=latest` (default) or `popular` |

`limit` is 1-50 (default 20). To get the next page, send `meta.nextCursor`
back as `?cursor=`. When `nextCursor` is `null`, you have reached the end.

## Rules every feed applies

Before any post reaches you, it must pass all of these checks:

1. **Not deleted.**
2. **No blocks.** If you blocked the author, or the author blocked you, you
   never see their posts.
3. **Visibility.** `public` posts can be seen by everyone. `followers` posts
   are only for the author and people who follow the author.
4. **Your reports.** A post you reported, or any post by a user you
   reported, is hidden from you.
5. **Heavily reported posts.** A post with **3 or more open reports**
   (status `received` or `under_review`) is removed from every feed until a
   moderator looks at it. A `dismissed` report no longer counts. The author
   still sees their own post.
6. **Author account active.** Posts by deleted or disabled profiles are
   left out.
7. **Sections only:** the post must have at least one attachment of the
   section's type that still exists and is `ready`. A video that is still
   processing, failed, or deleted does not appear in Videos.

Because some of these checks run after a page is loaded, a page can
sometimes contain **fewer** posts than `limit`. That does not mean the feed
has ended. Only `nextCursor: null` means the end.

## Two kinds of feed

### Chronological (latest, sections with `sort=latest`)

Newest first. The cursor remembers the last post you saw (its time and id).
A new post that arrives while you scroll never causes a repeat or a skip.
It simply appears at the top the next time you load the first page.

### Ranked (home, recommended, sections with `sort=popular`)

Scores change all the time, because people keep liking posts and posts get
older. If we re-ranked on every page, page 2 could repeat posts from page 1
or skip some. To avoid that:

1. On the **first page** (no cursor), we rank all candidate posts once and
   save that order as a **snapshot** for **30 minutes**. Snapshots are
   stored in the `feed_snapshots` collection and deleted automatically.
2. **Later pages** read the next posts from that saved order. Each post is
   checked again before it is shown, so a post deleted in the meantime is
   still left out.
3. **Pull-to-refresh** means asking for the first page again (no cursor).
   This builds a fresh snapshot, and new posts show up there.
4. If the cursor is older than 30 minutes, the API answers **`410 GONE`**.
   The app should then reload from the first page.

A cursor from one feed cannot be used on another feed, or with a different
`sort`. Doing so gives `400 Invalid cursor`.

## The score

Every ranked feed sorts by one score. It is meant to be simple and easy to
explain:

```
score = engagement × affinity × freshness
```

### Engagement: how much people reacted

```
engagement = 1 + likes×1 + comments×2 + shares×3 + saves×2
```

Comments, shares and saves take more effort than a like, so they count
for more. The `1 +` gives a brand-new post with no reactions a score above
zero, so it can still be ranked.

### Affinity: how close you are to the author (home only)

```
affinity = 1 + 0.25 × (your likes + comments + shares on this author's posts in the last 30 days)
```

The count stops at 12 interactions, so affinity goes from **1** (you never
interact with this author) up to **4** (you interact a lot). Without this,
an author you follow but always ignore would rank the same as a close
friend. Your interactions with your own posts don't count.

Recommended and `sort=popular` don't use affinity. They rank the same way
for everyone.

### Freshness: newer is better

```
freshness = 1 / (ageInHours + 2) ^ 1.5
```

| Post age | freshness | compared with a new post |
| -------- | --------- | ------------------------ |
| 0 h      | 0.354     | 100%                     |
| 1 h      | 0.192     | 54%                      |
| 2 h      | 0.125     | 35%                      |
| 6 h      | 0.044     | 12%                      |
| 24 h     | 0.0075    | 2%                       |
| 3 days   | 0.0016    | 0.4%                     |

In practice, a 1-day-old post needs about **17 times** more engagement
than a 2-hour-old post to rank the same. The `+ 2` stops posts from the
last few minutes from getting a huge score from age alone.

### Worked example (home feed)

| Post | Age    | Likes | Comments | Shares | Saves | Your interactions with author | engagement | affinity | freshness | **score** |
| ---- | ------ | ----- | -------- | ------ | ----- | ----------------------------- | ---------- | -------- | --------- | --------- |
| A    | 2 h    | 10    | 2        | 0      | 1     | 4                             | 17         | 2        | 0.125     | **4.25**  |
| B    | 24 h   | 40    | 5        | 2      | 0     | 0                             | 57         | 1        | 0.0075    | **0.43**  |
| C    | 10 min | 0     | 0        | 0      | 0     | 0                             | 1          | 1        | 0.313     | **0.31**  |

Order: **A, B, C**. A is fresh and by someone you interact with. B has many
reactions but is a day old. C is brand new but nobody has reacted to it yet.

## Each feed step by step

### `GET /feed/home`

1. **Candidates.**
   - **Following:** up to 400 posts from the last **30 days** by people you
     follow, plus your own posts.
   - **Discovery:** up to 100 public posts from the last **7 days** by
     people you don't follow.
2. **Filter:** apply the rules above.
3. **Score:** following posts use engagement × affinity × freshness.
   Discovery posts use engagement × freshness.
4. **Pin your own posts:** anything you posted in the **last 60 minutes**
   goes to the very top, newest first, so you always see what you just
   shared.
5. **Variety:** never more than **2 posts in a row from the same author**.
   If a third would follow, the next best post by someone else moves up.
   This applies only while other authors still have posts left.
6. **Mix in discovery:** every **5th** slot (5, 10, 15...) is a discovery
   post. If you follow few people, or they haven't posted lately, the
   remaining discovery posts fill the end of the feed. A new user who
   follows nobody still gets a feed.
7. **Snapshot** the order for paging, as described above.

### `GET /feed/recommended`

Public posts from the last **7 days** by people you don't follow (and not
your own). It takes the top 400 by engagement × freshness and applies the
same 2-in-a-row variety rule. If you already follow everyone who posted
recently, this feed is empty.

### `GET /feed/latest`

Every post you are allowed to see, newest first. That means public posts by
anyone, plus followers-only posts by people you follow, plus your own. The
optional `?type=photo|video|document` keeps only posts that have that kind
of attachment.

### `GET /feed/videos`, `/feed/pictures`, `/feed/documents`

The same posts as latest, limited to the section's type, and only when an
attachment of that type is **ready**. A post that mixes types, for example
a photo and a video, appears in both sections.

- `sort=latest` (default): newest first.
- `sort=popular`: posts from the last **30 days**, ranked by
  engagement × freshness, with the 2-in-a-row variety rule.

## Tuning

Edit [`feed.constants.ts`](feed.constants.ts), then update this page.

| Setting                                             | Now           | What it changes                                     |
| --------------------------------------------------- | ------------- | --------------------------------------------------- |
| `weights.like / comment / share / save`             | 1 / 2 / 3 / 2 | How much each reaction counts                       |
| `gravity`                                           | 1.5           | How fast posts fade. Higher means faster            |
| `ageOffsetHours`                                    | 2             | Damps the boost for the newest posts                |
| `affinityPerInteraction`, `affinityMaxInteractions` | 0.25, 12      | How much closeness to the author matters (max 4×)   |
| `affinityWindowDays`                                | 30            | How far back your interactions count                |
| `homeWindowDays`                                    | 30            | Oldest followed post that home can show             |
| `recommendedWindowDays`                             | 7             | Oldest discovery post                               |
| `homeDiscoveryEvery`                                | 5             | One discovery post every N slots                    |
| `ownPostPinMinutes`                                 | 60            | How long your own new post stays at the top of home |
| `maxSameAuthorInARow`                               | 2             | Variety rule                                        |
| `snapshotTtlMinutes`                                | 30            | How long a ranked cursor works                      |
| `reportHideThreshold`                               | 3             | Open reports that hide a post                       |

## How it scales, and what is not built yet

- **Computed when requested.** Home runs a few database queries per
  first page: your follows, blocks and reports, the candidates, saves, and
  your recent interactions. Later pages are cheap. This is fine for an
  early-stage app. With very large follow graphs, the next step is to
  precompute each user's home candidates when a post is created
  ("fan-out on write").
- **Narrowed in the database first.** MongoDB picks the top candidates with
  the same formula, without saves and affinity. Then the app adds those two
  signals and does the final sort. So a post with many saves but few other
  reactions can be missed when there are more than 400 candidates.
- **No "already seen" tracking yet.** The app doesn't record which posts
  you scrolled past, so a refresh can show the same top posts again. Adding
  a batched `POST /feed/impressions` endpoint would allow skipping them and
  measuring how often a shown post gets a reaction.
- **No "not interested" button yet**, and no report endpoint either. The
  report rules above already read the `reports` collection, so they start
  working as soon as a report API writes to it.
- **Home ends after 30 days.** Older posts by people you follow are not in
  home, but they are still in `latest` and on profiles.
- **Moderation is by count only.** Hiding a post at 3 open reports is a
  safety net, not a review. A moderator who confirms a report should
  delete the post.

## Files

| File                                                               | What it does                                                         |
| ------------------------------------------------------------------ | -------------------------------------------------------------------- |
| [`controller/feed.controller.ts`](controller/feed.controller.ts)   | The six routes                                                       |
| [`service/feed.service.ts`](service/feed.service.ts)               | Candidates, rules, snapshots, paging                                 |
| [`service/feed-ranker.service.ts`](service/feed-ranker.service.ts) | Loads saves and affinity, then scores                                |
| [`ranking.ts`](ranking.ts)                                         | The formula, the variety rule and the discovery mix (pure functions) |
| [`feed-cursor.ts`](feed-cursor.ts)                                 | Ranked-feed cursors                                                  |
| [`feed.constants.ts`](feed.constants.ts)                           | Every number on this page                                            |
| `src/database/schemas/feed-snapshot.schema.ts`                     | Saved ranked orders (expire automatically)                           |
