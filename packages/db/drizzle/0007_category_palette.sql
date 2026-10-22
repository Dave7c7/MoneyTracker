-- The category colours became the palette of the dashboards: one fixed colour
-- per group, so a group keeps its colour when the month changes.
--
-- Red is not used for a category: it is reserved for spending that went up
-- and for a budget that was passed.

UPDATE "categories" SET "color" = '#2a78d6' WHERE "slug" = 'housing';
UPDATE "categories" SET "color" = '#2a78d6' WHERE "slug" = 'rent';
UPDATE "categories" SET "color" = '#5996df' WHERE "slug" = 'utilities';

UPDATE "categories" SET "color" = '#eb6834' WHERE "slug" = 'bills';
UPDATE "categories" SET "color" = '#eb6834' WHERE "slug" = 'internet';
UPDATE "categories" SET "color" = '#ef8961' WHERE "slug" = 'phone';
UPDATE "categories" SET "color" = '#f4aa8d' WHERE "slug" = 'insurance';

UPDATE "categories" SET "color" = '#1baf7a' WHERE "slug" = 'food';
UPDATE "categories" SET "color" = '#1baf7a' WHERE "slug" = 'groceries';
UPDATE "categories" SET "color" = '#4dc197' WHERE "slug" = 'restaurants';
UPDATE "categories" SET "color" = '#7fd2b5' WHERE "slug" = 'coffee';

UPDATE "categories" SET "color" = '#eda100' WHERE "slug" = 'transport';
UPDATE "categories" SET "color" = '#eda100' WHERE "slug" = 'gas';
UPDATE "categories" SET "color" = '#f1b638' WHERE "slug" = 'transit';

UPDATE "categories" SET "color" = '#e87ba4' WHERE "slug" = 'entertainment';
UPDATE "categories" SET "color" = '#e87ba4' WHERE "slug" = 'subscriptions';
UPDATE "categories" SET "color" = '#ed98b8' WHERE "slug" = 'movies';

UPDATE "categories" SET "color" = '#008300' WHERE "slug" = 'travel';
UPDATE "categories" SET "color" = '#6250d6' WHERE "slug" = 'health';
UPDATE "categories" SET "color" = '#0f9b8e' WHERE "slug" = 'shopping';
UPDATE "categories" SET "color" = '#7c5cff' WHERE "slug" = 'personal-care';
UPDATE "categories" SET "color" = '#8b5a2b' WHERE "slug" = 'education';
