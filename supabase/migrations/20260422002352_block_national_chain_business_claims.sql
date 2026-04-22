-- Block users from claiming national chains as their business.
-- See lib/chainDenylist.ts for the client-side sibling logic + rationale.
--
-- Defense in depth: this server trigger is authoritative; the client match
-- is friendly-UX. A user with a hacked client cannot bypass the DB check.

CREATE TABLE IF NOT EXISTS public.blocked_chain_names (
  normalized_name text PRIMARY KEY,
  display_name text NOT NULL,
  match_mode text NOT NULL CHECK (match_mode IN ('exact','prefix')),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.blocked_chain_names ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS blocked_chain_names_read ON public.blocked_chain_names;
CREATE POLICY blocked_chain_names_read ON public.blocked_chain_names
  FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.normalize_business_name(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT btrim(
    regexp_replace(
      regexp_replace(lower(coalesce(raw, '')), '[^a-z0-9]+', ' ', 'g'),
      '\s+', ' ', 'g'
    )
  )
$fn$;

CREATE OR REPLACE FUNCTION public.match_blocked_chain(raw text)
RETURNS text
LANGUAGE plpgsql
STABLE
AS $fn$
DECLARE
  norm text := public.normalize_business_name(raw);
  rec record;
  next_token text;
BEGIN
  IF norm = '' THEN
    RETURN NULL;
  END IF;

  FOR rec IN
    SELECT normalized_name, display_name
    FROM public.blocked_chain_names
    WHERE match_mode = 'prefix'
    ORDER BY length(normalized_name) DESC
  LOOP
    IF norm = rec.normalized_name
       OR norm LIKE rec.normalized_name || ' %'
    THEN
      RETURN rec.display_name;
    END IF;
  END LOOP;

  FOR rec IN
    SELECT normalized_name, display_name
    FROM public.blocked_chain_names
    WHERE match_mode = 'exact'
  LOOP
    IF norm = rec.normalized_name THEN
      RETURN rec.display_name;
    END IF;
    IF norm LIKE rec.normalized_name || ' %' THEN
      next_token := split_part(substring(norm FROM length(rec.normalized_name) + 2), ' ', 1);
      IF next_token ~ '^[0-9]'
         OR next_token IN (
           'store','stores','pharmacy','restaurant','location','cafe',
           'express','supercenter','market','inc','corp','corporation',
           'company','co','llc','no','number'
         )
      THEN
        RETURN rec.display_name;
      END IF;
    END IF;
  END LOOP;

  RETURN NULL;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.enforce_chain_denylist()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
DECLARE
  matched text;
BEGIN
  matched := public.match_blocked_chain(NEW.business_name);
  IF matched IS NOT NULL THEN
    RAISE EXCEPTION
      '"%" is a national chain and cannot be claimed in Downtown Vibes. Contact support@potionsandfamiliars.com for franchisee onboarding.',
      matched
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS enforce_chain_denylist_trg ON public.businesses;
CREATE TRIGGER enforce_chain_denylist_trg
BEFORE INSERT OR UPDATE OF business_name ON public.businesses
FOR EACH ROW
EXECUTE FUNCTION public.enforce_chain_denylist();

INSERT INTO public.blocked_chain_names (normalized_name, display_name, match_mode) VALUES
  ('burger king', 'Burger King', 'prefix'),
  ('taco bell', 'Taco Bell', 'prefix'),
  ('jack in the box', 'Jack in the Box', 'prefix'),
  ('five guys', 'Five Guys', 'prefix'),
  ('shake shack', 'Shake Shack', 'prefix'),
  ('panda express', 'Panda Express', 'prefix'),
  ('pizza hut', 'Pizza Hut', 'prefix'),
  ('papa johns', 'Papa John''s', 'prefix'),
  ('little caesars', 'Little Caesars', 'prefix'),
  ('carls jr', 'Carl''s Jr', 'prefix'),
  ('dairy queen', 'Dairy Queen', 'prefix'),
  ('in n out burger', 'In-N-Out Burger', 'prefix'),
  ('in n out', 'In-N-Out Burger', 'prefix'),
  ('raising canes', 'Raising Cane''s', 'prefix'),
  ('jersey mikes', 'Jersey Mike''s', 'prefix'),
  ('jimmy johns', 'Jimmy John''s', 'prefix'),
  ('firehouse subs', 'Firehouse Subs', 'prefix'),
  ('auntie annes', 'Auntie Anne''s', 'prefix'),
  ('buffalo wild wings', 'Buffalo Wild Wings', 'prefix'),
  ('steak n shake', 'Steak ''n Shake', 'prefix'),
  ('kentucky fried chicken', 'Kentucky Fried Chicken', 'prefix'),
  ('mc donalds', 'McDonald''s', 'prefix'),
  ('mcdonalds', 'McDonald''s', 'exact'),
  ('wendys', 'Wendy''s', 'exact'),
  ('subway', 'Subway', 'exact'),
  ('chipotle', 'Chipotle', 'exact'),
  ('kfc', 'KFC', 'exact'),
  ('popeyes', 'Popeyes', 'exact'),
  ('arbys', 'Arby''s', 'exact'),
  ('sonic', 'Sonic', 'exact'),
  ('whataburger', 'Whataburger', 'exact'),
  ('dominos', 'Domino''s', 'exact'),
  ('hardees', 'Hardee''s', 'exact'),
  ('culvers', 'Culver''s', 'exact'),
  ('zaxbys', 'Zaxby''s', 'exact'),
  ('bojangles', 'Bojangles', 'exact'),
  ('quiznos', 'Quiznos', 'exact'),
  ('cinnabon', 'Cinnabon', 'exact'),
  ('wingstop', 'Wingstop', 'exact'),
  ('chick fil a', 'Chick-fil-A', 'prefix'),
  ('starbucks', 'Starbucks', 'exact'),
  ('dunkin', 'Dunkin''', 'exact'),
  ('dunkin donuts', 'Dunkin'' Donuts', 'prefix'),
  ('tim hortons', 'Tim Hortons', 'prefix'),
  ('caribou coffee', 'Caribou Coffee', 'prefix'),
  ('peets coffee', 'Peet''s Coffee', 'prefix'),
  ('krispy kreme', 'Krispy Kreme', 'prefix'),
  ('scooters coffee', 'Scooter''s Coffee', 'prefix'),
  ('dutch bros', 'Dutch Bros', 'prefix'),
  ('applebees', 'Applebee''s', 'exact'),
  ('olive garden', 'Olive Garden', 'prefix'),
  ('red lobster', 'Red Lobster', 'prefix'),
  ('outback steakhouse', 'Outback Steakhouse', 'prefix'),
  ('tgi fridays', 'TGI Fridays', 'prefix'),
  ('ruby tuesday', 'Ruby Tuesday', 'prefix'),
  ('chilis', 'Chili''s', 'exact'),
  ('ihop', 'IHOP', 'exact'),
  ('dennys', 'Denny''s', 'exact'),
  ('cracker barrel', 'Cracker Barrel', 'prefix'),
  ('cheesecake factory', 'Cheesecake Factory', 'prefix'),
  ('the cheesecake factory', 'The Cheesecake Factory', 'prefix'),
  ('texas roadhouse', 'Texas Roadhouse', 'prefix'),
  ('longhorn steakhouse', 'LongHorn Steakhouse', 'prefix'),
  ('hooters', 'Hooters', 'exact'),
  ('red robin', 'Red Robin', 'prefix'),
  ('bob evans', 'Bob Evans', 'prefix'),
  ('perkins', 'Perkins', 'exact'),
  ('walmart', 'Walmart', 'exact'),
  ('walmart supercenter', 'Walmart Supercenter', 'prefix'),
  ('target', 'Target', 'exact'),
  ('costco', 'Costco', 'exact'),
  ('sams club', 'Sam''s Club', 'prefix'),
  ('best buy', 'Best Buy', 'prefix'),
  ('home depot', 'Home Depot', 'prefix'),
  ('the home depot', 'The Home Depot', 'prefix'),
  ('lowes', 'Lowe''s', 'exact'),
  ('kohls', 'Kohl''s', 'exact'),
  ('macys', 'Macy''s', 'exact'),
  ('jcpenney', 'JCPenney', 'exact'),
  ('nordstrom', 'Nordstrom', 'exact'),
  ('nordstrom rack', 'Nordstrom Rack', 'prefix'),
  ('tj maxx', 'TJ Maxx', 'prefix'),
  ('tjmaxx', 'TJMaxx', 'exact'),
  ('marshalls', 'Marshalls', 'exact'),
  ('ross', 'Ross', 'exact'),
  ('old navy', 'Old Navy', 'prefix'),
  ('gap', 'Gap', 'exact'),
  ('banana republic', 'Banana Republic', 'prefix'),
  ('foot locker', 'Foot Locker', 'prefix'),
  ('gamestop', 'GameStop', 'exact'),
  ('barnes noble', 'Barnes & Noble', 'prefix'),
  ('dollar general', 'Dollar General', 'prefix'),
  ('dollar tree', 'Dollar Tree', 'prefix'),
  ('family dollar', 'Family Dollar', 'prefix'),
  ('five below', 'Five Below', 'prefix'),
  ('hobby lobby', 'Hobby Lobby', 'prefix'),
  ('michaels', 'Michaels', 'exact'),
  ('joann', 'Joann', 'exact'),
  ('office depot', 'Office Depot', 'prefix'),
  ('staples', 'Staples', 'exact'),
  ('petsmart', 'PetSmart', 'exact'),
  ('petco', 'Petco', 'exact'),
  ('tractor supply', 'Tractor Supply', 'prefix'),
  ('kroger', 'Kroger', 'exact'),
  ('publix', 'Publix', 'exact'),
  ('safeway', 'Safeway', 'exact'),
  ('albertsons', 'Albertsons', 'exact'),
  ('whole foods', 'Whole Foods', 'prefix'),
  ('whole foods market', 'Whole Foods Market', 'prefix'),
  ('trader joes', 'Trader Joe''s', 'prefix'),
  ('aldi', 'Aldi', 'exact'),
  ('lidl', 'Lidl', 'exact'),
  ('heb', 'H-E-B', 'exact'),
  ('h e b', 'H-E-B', 'prefix'),
  ('hy vee', 'Hy-Vee', 'prefix'),
  ('meijer', 'Meijer', 'exact'),
  ('wegmans', 'Wegmans', 'exact'),
  ('sprouts', 'Sprouts', 'exact'),
  ('sprouts farmers market', 'Sprouts Farmers Market', 'prefix'),
  ('winn dixie', 'Winn-Dixie', 'prefix'),
  ('food lion', 'Food Lion', 'prefix'),
  ('schnucks', 'Schnucks', 'exact'),
  ('price chopper', 'Price Chopper', 'prefix'),
  ('cvs', 'CVS', 'exact'),
  ('cvs pharmacy', 'CVS Pharmacy', 'prefix'),
  ('walgreens', 'Walgreens', 'exact'),
  ('rite aid', 'Rite Aid', 'prefix'),
  ('shell', 'Shell', 'exact'),
  ('chevron', 'Chevron', 'exact'),
  ('exxon', 'Exxon', 'exact'),
  ('exxonmobil', 'ExxonMobil', 'exact'),
  ('mobil', 'Mobil', 'exact'),
  ('bp', 'BP', 'exact'),
  ('texaco', 'Texaco', 'exact'),
  ('marathon', 'Marathon', 'exact'),
  ('valero', 'Valero', 'exact'),
  ('sunoco', 'Sunoco', 'exact'),
  ('speedway', 'Speedway', 'exact'),
  ('caseys', 'Casey''s', 'exact'),
  ('caseys general store', 'Casey''s General Store', 'prefix'),
  ('wawa', 'Wawa', 'exact'),
  ('sheetz', 'Sheetz', 'exact'),
  ('7 eleven', '7-Eleven', 'prefix'),
  ('7 11', '7-Eleven', 'prefix'),
  ('seven eleven', '7-Eleven', 'prefix'),
  ('circle k', 'Circle K', 'prefix'),
  ('quiktrip', 'QuikTrip', 'exact'),
  ('racetrac', 'RaceTrac', 'exact'),
  ('kum go', 'Kum & Go', 'prefix'),
  ('maverik', 'Maverik', 'exact'),
  ('phillips 66', 'Phillips 66', 'prefix'),
  ('conoco', 'Conoco', 'exact'),
  ('citgo', 'Citgo', 'exact'),
  ('pilot', 'Pilot', 'exact'),
  ('loves', 'Love''s', 'exact'),
  ('loves travel stops', 'Love''s Travel Stops', 'prefix'),
  ('loaf n jug', 'Loaf N Jug', 'prefix'),
  ('marriott', 'Marriott', 'exact'),
  ('hilton', 'Hilton', 'exact'),
  ('hyatt', 'Hyatt', 'exact'),
  ('holiday inn', 'Holiday Inn', 'prefix'),
  ('holiday inn express', 'Holiday Inn Express', 'prefix'),
  ('best western', 'Best Western', 'prefix'),
  ('comfort inn', 'Comfort Inn', 'prefix'),
  ('comfort suites', 'Comfort Suites', 'prefix'),
  ('hampton inn', 'Hampton Inn', 'prefix'),
  ('quality inn', 'Quality Inn', 'prefix'),
  ('days inn', 'Days Inn', 'prefix'),
  ('super 8', 'Super 8', 'prefix'),
  ('motel 6', 'Motel 6', 'prefix'),
  ('red roof inn', 'Red Roof Inn', 'prefix'),
  ('la quinta', 'La Quinta', 'prefix'),
  ('courtyard by marriott', 'Courtyard by Marriott', 'prefix'),
  ('residence inn', 'Residence Inn', 'prefix'),
  ('embassy suites', 'Embassy Suites', 'prefix'),
  ('fairfield inn', 'Fairfield Inn', 'prefix'),
  ('springhill suites', 'SpringHill Suites', 'prefix'),
  ('towneplace suites', 'TownePlace Suites', 'prefix'),
  ('drury inn', 'Drury Inn', 'prefix'),
  ('drury hotels', 'Drury Hotels', 'prefix'),
  ('candlewood suites', 'Candlewood Suites', 'prefix'),
  ('sheraton', 'Sheraton', 'exact'),
  ('westin', 'Westin', 'exact'),
  ('doubletree', 'Doubletree', 'exact'),
  ('crowne plaza', 'Crowne Plaza', 'prefix'),
  ('wyndham', 'Wyndham', 'exact'),
  ('ramada', 'Ramada', 'exact'),
  ('bank of america', 'Bank of America', 'prefix'),
  ('chase', 'Chase', 'exact'),
  ('chase bank', 'Chase Bank', 'prefix'),
  ('wells fargo', 'Wells Fargo', 'prefix'),
  ('citibank', 'Citibank', 'exact'),
  ('us bank', 'US Bank', 'prefix'),
  ('u s bank', 'U.S. Bank', 'prefix'),
  ('pnc', 'PNC', 'exact'),
  ('pnc bank', 'PNC Bank', 'prefix'),
  ('capital one', 'Capital One', 'prefix'),
  ('td bank', 'TD Bank', 'prefix'),
  ('truist', 'Truist', 'exact'),
  ('regions bank', 'Regions Bank', 'prefix'),
  ('fifth third bank', 'Fifth Third Bank', 'prefix'),
  ('commerce bank', 'Commerce Bank', 'prefix'),
  ('nodaway valley bank', 'Nodaway Valley Bank', 'prefix'),
  ('h r block', 'H&R Block', 'prefix'),
  ('jackson hewitt', 'Jackson Hewitt', 'prefix'),
  ('liberty tax', 'Liberty Tax', 'prefix'),
  ('edward jones', 'Edward Jones', 'prefix'),
  ('autozone', 'AutoZone', 'exact'),
  ('o reilly auto parts', 'O''Reilly Auto Parts', 'prefix'),
  ('napa auto parts', 'NAPA Auto Parts', 'prefix'),
  ('advance auto parts', 'Advance Auto Parts', 'prefix'),
  ('pep boys', 'Pep Boys', 'prefix'),
  ('jiffy lube', 'Jiffy Lube', 'prefix'),
  ('valvoline', 'Valvoline', 'exact'),
  ('midas', 'Midas', 'exact'),
  ('firestone', 'Firestone', 'exact'),
  ('goodyear', 'Goodyear', 'exact'),
  ('discount tire', 'Discount Tire', 'prefix'),
  ('big o tires', 'Big O Tires', 'prefix'),
  ('mavis tire', 'Mavis Tire', 'prefix'),
  ('meineke', 'Meineke', 'exact'),
  ('verizon', 'Verizon', 'exact'),
  ('at t', 'AT&T', 'prefix'),
  ('t mobile', 'T-Mobile', 'prefix'),
  ('sprint', 'Sprint', 'exact'),
  ('xfinity', 'Xfinity', 'exact'),
  ('spectrum', 'Spectrum', 'exact'),
  ('apple store', 'Apple Store', 'prefix'),
  ('fedex', 'FedEx', 'exact'),
  ('fedex office', 'FedEx Office', 'prefix'),
  ('ups store', 'UPS Store', 'prefix'),
  ('the ups store', 'The UPS Store', 'prefix'),
  ('usps', 'USPS', 'exact'),
  ('united states postal service', 'United States Postal Service', 'prefix'),
  ('planet fitness', 'Planet Fitness', 'prefix'),
  ('anytime fitness', 'Anytime Fitness', 'prefix'),
  ('la fitness', 'LA Fitness', 'prefix'),
  ('golds gym', 'Gold''s Gym', 'prefix'),
  ('orangetheory', 'Orangetheory', 'exact'),
  ('orangetheory fitness', 'Orangetheory Fitness', 'prefix'),
  ('crossfit', 'CrossFit', 'exact'),
  ('ymca', 'YMCA', 'exact')
ON CONFLICT (normalized_name) DO NOTHING;
