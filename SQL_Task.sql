-- PROJECT  : Customer Churn & Retention Analysis

-- DATABASE SETUP

-- Select the working database where all tables are stored
USE assignment;

-- DATA EXPLORATION — Preview All Tables
-- Purpose: Understand structure and content before analysis

-- Preview available subscription plans (plan_id, plan_name, plan_tier, pricing)
SELECT * FROM plans;

-- Preview customer master data (customer_id, company_name, contact info)
SELECT * FROM customers;

-- Preview feature flags (which features are enabled per plan)
SELECT * FROM feature_flags;

-- Preview support tickets (ticket_id, customer_id, created_at, status)
SELECT * FROM support_tickets;

-- Preview team members (member_id, customer_id, email, role)
SELECT * FROM team_members;

-- Preview billing invoices (invoice_id, amount, status, paid_at)
SELECT * FROM billing_invoices;

-- Preview subscription records (subscription_id, customer_id, plan_id, status, dates)
SELECT * FROM subscriptions;

-- Preview team members again for reference
SELECT * FROM team_members;


-- Q1: Plan-wise Active Customers, Average Revenue & Ticket Rate

-- Question:
--    For each subscription plan, how many active customers exist,
--    what is the average monthly revenue, and how many support
--    tickets are raised per customer?

-- Join Logic:
--    INNER JOIN plans: Get plan name and tier for each subscription
--    LEFT JOIN support_tickets: Include customers with 0 tickets too

-- Filter: Only active subscriptions (status = 'active')

SELECT
    p.plan_name,                                        
    p.plan_tier,                                        

    -- Count of unique active customers per plan
    COUNT(DISTINCT s.customer_id) AS active_customers,

    -- Average Monthly Recurring Revenue per plan
    ROUND(AVG(s.mrr_usd), 2) AS avg_monthly_revenue,

    -- Support ticket rate = Total tickets / Total unique customers
    -- Indicates support dependency per plan
    ROUND(
        CAST(COUNT(t.ticket_id) AS DECIMAL(10,2))
        /
        (COUNT(DISTINCT s.customer_id)),
    2) AS tickets_per_customer

FROM subscriptions s

    -- Get plan details for each subscription
    JOIN plans p
        ON s.plan_id = p.plan_id

    -- LEFT JOIN to include customers with no tickets (ticket_id will be NULL)
    LEFT JOIN support_tickets t
        ON s.customer_id = t.customer_id

-- Only analyze currently active subscriptions
WHERE s.status = 'active'

-- Aggregate at plan level
GROUP BY p.plan_name, p.plan_tier

-- Show highest customer count plans first
ORDER BY active_customers DESC;

-- Q1 INSIGHTS:

-- Free plan has the highest number of customers
--    Indicates strong top-of-funnel user acquisition
--    Product adoption is healthy at entry level

-- Enterprise Custom plan generates highest monthly revenue
--     Premium clients are the key revenue contributors
--     Focus retention efforts on enterprise segment

-- Enterprise users raise the most tickets per customer
--     Higher support dependency among premium customers
--     May indicate complex product usage or more feature requests
--     Consider dedicated enterprise support team

-- Q1 SUPPLEMENTARY: Ticket Rate Only (Simplified View)
-- Purpose: Quick reference for tickets per customer by plan


SELECT
    p.plan_name,
    p.plan_tier,

    -- Ticket rate using decimal multiplication to avoid integer division
    ROUND(COUNT(t.ticket_id) * 1.0 / COUNT(DISTINCT s.customer_id), 2) AS tickets_per_customer

FROM subscriptions s

    JOIN plans p
        ON s.plan_id = p.plan_id

    LEFT JOIN support_tickets t
        ON s.customer_id = t.customer_id

WHERE s.status = 'active'

GROUP BY
    p.plan_name,
    p.plan_tier;


-- Q2: Rank Customers by Lifetime Value (LTV) Within Each Plan Tier

-- Question:
--    Who are the highest value customers in each plan tier?
--    How does each customer's LTV compare to their tier average?

-- Tables Used:
--    customers → subscriptions → plans → billing_invoices
--
-- Window Functions Used:
--    RANK()  → Rank customers within each plan tier by LTV
--    AVG()   → Calculate average LTV per plan tier
--
-- LTV Definition:
--    Sum of all paid invoice amounts (total_usd) per customer
--
-- Filter: Only paid invoices (status = 'paid')

SELECT
    c.customer_id,
    c.company_name,
    p.plan_tier,

    -- Total Lifetime Value = Sum of all paid invoices per customer
    SUM(b.total_usd) AS lifetime_value,

    -- Rank customers within their plan tier (1 = highest LTV)
    -- PARTITION BY plan_tier → ranking resets for each tier
    RANK() OVER (
        PARTITION BY p.plan_tier
        ORDER BY SUM(b.total_usd) DESC
    ) AS customer_rank,

    -- Average LTV of all customers in the same plan tier
    -- Used as benchmark for comparison
    ROUND(
        AVG(SUM(b.total_usd)) OVER (PARTITION BY p.plan_tier),
    2) AS tier_average_ltv,

    -- % difference between customer LTV and tier average
    -- Positive = customer is above average (high value)
    -- Negative = customer is below average (at-risk)
    ROUND(
        (SUM(b.total_usd) - AVG(SUM(b.total_usd)) OVER (PARTITION BY p.plan_tier))
        / AVG(SUM(b.total_usd)) OVER (PARTITION BY p.plan_tier) * 100,
    2) AS percentage_difference

FROM customers c

    -- Link customers to their subscriptions
    JOIN subscriptions s
        ON c.customer_id = s.customer_id

    -- Get plan tier for partitioning
    JOIN plans p
        ON s.plan_id = p.plan_id

    -- Get billing amounts for LTV calculation
    JOIN billing_invoices b
        ON s.subscription_id = b.subscription_id

-- Only count revenue from successfully paid invoices
WHERE b.status = 'paid'

-- Group at customer + plan level before applying window functions
GROUP BY
    c.customer_id,
    c.company_name,
    p.plan_tier;

-- Q2 INSIGHTS:

-- Customers with high positive % difference are VIP accounts
--    Prioritize retention and upsell opportunities
--
-- Customers with negative % difference are below tier average
--     May indicate underutilization or churn risk
--     Target with engagement campaigns
--
-- Rank 1 customer in each tier = highest revenue contributor
--     Assign dedicated account managers


-- Q3: Customers Who Downgraded Their Plan in Last 90 Days
--     with More Than 3 Support Tickets Before Downgrading

-- Business Question:
--    Which customers downgraded their plan recently AND had
--    high support ticket volume before downgrading?
--    These are high-risk churn signals.

-- Tables Used:
--    subscriptions → plans (current & previous plan)
--    customers (company details)
--    support_tickets (ticket count before downgrade)

-- CTE Logic:
--    downgrade_data → Uses LAG() to get previous plan details
--                     for each customer's subscription history

-- Downgrade Definition:
--    enterprise → any lower tier
--    professional → starter or free
--    starter → free
--
-- Time Filters:
--    Downgrade: within last 90 days
--    Tickets: within 30 days before downgrade date

-- Step 1: CTE to identify plan changes using LAG window function
WITH downgrade_data AS (
    SELECT
        s.customer_id,
        s.start_date,                                   -- Date of new (downgraded) plan start

        p.plan_name AS current_plan,                    -- Current (lower) plan name
        p.plan_tier AS current_tier,                    -- Current (lower) plan tier

        -- Get the previous plan name using LAG
        -- LAG looks at the previous row within same customer ordered by date
        LAG(p.plan_name) OVER (
            PARTITION BY s.customer_id
            ORDER BY s.start_date
        ) AS previous_plan,

        -- Get the previous plan tier using LAG
        LAG(p.plan_tier) OVER (
            PARTITION BY s.customer_id
            ORDER BY s.start_date
        ) AS previous_tier

    FROM subscriptions s

        JOIN plans p
            ON s.plan_id = p.plan_id
)

-- Step 2: Filter downgraded customers with high ticket volume
SELECT
    c.customer_id,
    c.company_name,

    d.previous_plan,                                    -- Plan before downgrade
    d.previous_tier,                                    -- Tier before downgrade

    d.current_plan,                                     -- Plan after downgrade
    d.current_tier,                                     -- Tier after downgrade

    -- Count of support tickets raised in 30 days before downgrade
    COUNT(t.ticket_id) AS tickets_before_downgrade

FROM downgrade_data d

    JOIN customers c
        ON d.customer_id = c.customer_id

    JOIN support_tickets t
        ON d.customer_id = t.customer_id

WHERE
    -- Filter: Downgrade happened within last 90 days
    d.start_date >= CURRENT_DATE - INTERVAL 90 DAY

    -- Filter: Only count tickets raised in 30 days BEFORE downgrade
    AND t.created_at >= d.start_date - INTERVAL 30 DAY

    -- Filter: Only true downgrades (tier reduction)
    AND (
        -- Enterprise to any lower tier
        (d.previous_tier = 'enterprise' AND d.current_tier != 'enterprise')
        OR
        -- Professional to starter or free
        (d.previous_tier = 'professional' AND d.current_tier IN ('starter', 'free'))
        OR
        -- Starter to free
        (d.previous_tier = 'starter' AND d.current_tier = 'free')
    )

GROUP BY
    c.customer_id,
    c.company_name,
    d.previous_plan,
    d.previous_tier,
    d.current_plan,
    d.current_tier

-- Filter: Only customers with more than 3 tickets before downgrade
-- High ticket volume = frustration signal before downgrade
HAVING COUNT(t.ticket_id) > 3;


-- Q3 INSIGHTS:
-- High ticket volume before downgrade = product dissatisfaction
--     These customers needed more support than they received

-- Downgrade within 90 days = recent revenue loss
--     Immediate win-back opportunity
--
-- Action: Reach out to these customers with:
--     Personalized success calls
--     Temporary discount to upgrade back
--     Dedicated support resources


-- Q3 DEBUG QUERIES: Step-by-step validation

-- Debug Step 1: View raw subscription history per customer
-- Purpose: Verify subscription date ordering before applying LAG
SELECT
    s.customer_id,
    s.start_date,
    p.plan_name,
    p.plan_tier
FROM subscriptions s
    JOIN plans p ON s.plan_id = p.plan_id
ORDER BY s.customer_id, s.start_date;


-- Debug Step 2: View LAG results to verify plan tier changes
-- Purpose: Confirm current vs previous tier is correctly identified
SELECT
    s.customer_id,
    s.start_date,
    p.plan_tier AS current_tier,
    LAG(p.plan_tier) OVER (
        PARTITION BY s.customer_id
        ORDER BY s.start_date
    ) AS previous_tier
FROM subscriptions s
    JOIN plans p ON s.plan_id = p.plan_id;


-- Debug Step 3: View all downgraded customers without ticket filter
-- Purpose: See full downgrade list before applying ticket HAVING clause
WITH downgrade_data AS (
    SELECT
        s.customer_id,
        s.start_date,
        p.plan_name AS current_plan,
        p.plan_tier AS current_tier,
        LAG(p.plan_name) OVER (
            PARTITION BY s.customer_id ORDER BY s.start_date
        ) AS previous_plan,
        LAG(p.plan_tier) OVER (
            PARTITION BY s.customer_id ORDER BY s.start_date
        ) AS previous_tier
    FROM subscriptions s
        JOIN plans p ON s.plan_id = p.plan_id
)
SELECT *
FROM downgrade_data
WHERE (
    (previous_tier = 'enterprise' AND current_tier != 'enterprise')
    OR (previous_tier = 'professional' AND current_tier IN ('starter', 'free'))
    OR (previous_tier = 'starter' AND current_tier = 'free')
);


-- Debug Step 4: Full downgrade list with ticket counts (no HAVING filter)
-- Purpose: See all downgraded customers and their ticket volumes
WITH downgrade_data AS (
    SELECT
        s.customer_id,
        s.start_date,
        p.plan_name AS current_plan,
        p.plan_tier AS current_tier,
        LAG(p.plan_name) OVER (
            PARTITION BY s.customer_id ORDER BY s.start_date
        ) AS previous_plan,
        LAG(p.plan_tier) OVER (
            PARTITION BY s.customer_id ORDER BY s.start_date
        ) AS previous_tier
    FROM subscriptions s
        JOIN plans p ON s.plan_id = p.plan_id
)
SELECT
    c.customer_id,
    c.company_name,
    d.previous_plan,
    d.previous_tier,
    d.current_plan,
    d.current_tier,
    COUNT(t.ticket_id) AS total_tickets
FROM downgrade_data d
    JOIN customers c ON d.customer_id = c.customer_id
    LEFT JOIN support_tickets t ON d.customer_id = t.customer_id
WHERE (
    (previous_tier = 'enterprise' AND current_tier != 'enterprise')
    OR (previous_tier = 'professional' AND current_tier IN ('starter', 'free'))
    OR (previous_tier = 'starter' AND current_tier = 'free')
)
GROUP BY
    c.customer_id, c.company_name,
    d.previous_plan, d.previous_tier,
    d.current_plan, d.current_tier

-- Final filter: customers with more than 3 tickets = high frustration signal
HAVING total_tickets > 3;


-- Q4: Month-over-Month Subscription Growth & Rolling Churn Rate

-- Business Question:
--    How is subscription growth trending month over month?
--    What is the rolling 3-month churn rate by plan tier?
--    Which months had abnormally high churn?
--
-- Tables Used:
--    subscriptions → plans
--
-- CTEs Used:
--    monthly_data  → Aggregate new subscriptions & churn per month/tier
--    growth_data   → Calculate MOM growth & rolling 3-month churn avg
--
-- Metrics Calculated:
--    MOM Growth Rate     = (Current - Previous) / Previous * 100
--    Rolling Avg Churn   = Average of last 3 months churn count
--    Churn Flag          = ALERT if churn > 2x rolling average
--
-- Churn Flag Logic:
--    If current month churn > 2 × rolling 3-month average → ALERT
--    This identifies months with abnormally high churn spikes

-- Step 1: Aggregate monthly subscription and churn counts per plan tier
WITH monthly_data AS (
    SELECT
        -- Truncate date to first of month for consistent grouping
        DATE_FORMAT(start_date, '%Y-%m-01') AS month,
        p.plan_tier,

        -- Count of new subscriptions started in this month
        COUNT(*) AS new_subscriptions,

        -- Count of cancellations in this month
        -- Used to calculate churn rate
        SUM(
            CASE
                WHEN s.status = 'cancelled' THEN 1
                ELSE 0
            END
        ) AS churn_count

    FROM subscriptions s

        JOIN plans p
            ON s.plan_id = p.plan_id

    GROUP BY
        DATE_FORMAT(start_date, '%Y-%m-01'),
        p.plan_tier
),

-- Step 2: Calculate MOM growth and rolling 3-month churn average
growth_data AS (
    SELECT
        month,
        plan_tier,
        new_subscriptions,
        churn_count,

        -- Previous month subscription count for MOM calculation
        -- LAG(1) = look back 1 row within same plan tier
        LAG(new_subscriptions) OVER (
            PARTITION BY plan_tier
            ORDER BY month
        ) AS previous_month_subscriptions,

        -- Rolling 3-month average churn
        -- ROWS BETWEEN 2 PRECEDING AND CURRENT ROW = last 3 months including current
        AVG(churn_count) OVER (
            PARTITION BY plan_tier
            ORDER BY month
            ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
        ) AS rolling_3_month_avg_churn

    FROM monthly_data
)

-- Step 3: Final output with MOM growth rate and churn flag
SELECT
    month,
    plan_tier,
    new_subscriptions,

    -- MOM Growth Rate %
    -- NULL for first month (no previous month to compare)
    ROUND(
        (new_subscriptions - previous_month_subscriptions)
        / previous_month_subscriptions * 100,
    2) AS mom_growth_rate,

    churn_count,

    -- Rolling 3-month average churn rounded to 2 decimal places
    ROUND(rolling_3_month_avg_churn, 2) AS rolling_avg_churn,

    -- Churn Alert Flag
    -- ALERT = this month's churn is more than double the rolling average
    -- Indicates an abnormal churn spike requiring immediate investigation
    CASE
        WHEN churn_count > 2 * rolling_3_month_avg_churn THEN 'ALERT ⚠️'
        ELSE 'NORMAL ✅'
    END AS churn_flag

FROM growth_data;


-- Q4 INSIGHTS:

-- Positive MOM growth = healthy acquisition pipeline
--     Monitor consistently for growth trends
--
-- ALERT months = abnormal churn spikes
--     Investigate product issues, pricing changes, or competitor moves
--     Cross-reference with support tickets from same period
--
-- Rolling avg churn smooths out seasonal fluctuations
--     More reliable than single-month churn for trend analysis
--
-- Plan tier breakdown reveals which segment drives growth/churn
--     Focus retention on highest MRR tiers showing ALERT status


-- Q5: Detect Potential Duplicate Customer Accounts

--  Business Question:
--    Are there duplicate customer accounts in the system?
--    Duplicates inflate customer counts and distort analytics.
--
--  Tables Used:
--    customers (self-join for comparison)
--    team_members (shared email detection)
--
--  Matching Logic (3 Criteria):

-- Criteria 1: Similar Company Names
--     Convert both names to lowercase
--     Remove all spaces
--     If they match exactly = likely duplicate

-- Criteria 2: Same Email Domain
--     Extract domain from contact_email using SUBSTRING_INDEX
--     If both customers share same domain = likely same company

-- Criteria 3: Overlapping Team Members
--     If same team member email appears in two accounts
--    Strong signal of duplicate or related accounts

-- Note: c1.customer_id < c2.customer_id prevents duplicate pairs
--    (A,B) and (B,A) showing as separate results


SELECT
    c1.customer_id AS customer_1,
    c1.company_name AS company_name_1,

    c2.customer_id AS customer_2,
    c2.company_name AS company_name_2,

    c1.contact_email AS email_1,
    c2.contact_email AS email_2,

    -- The shared team member email (NULL if matched on name/domain only)
    tm1.email AS shared_team_member

FROM customers c1

    -- Self join: Compare every customer pair
    -- c1.customer_id < c2.customer_id ensures each pair appears only once
    JOIN customers c2
        ON c1.customer_id < c2.customer_id

    -- Get team members for customer 1
    LEFT JOIN team_members tm1
        ON c1.customer_id = tm1.customer_id

    -- Get team members for customer 2
    -- Match only where same email exists in both accounts
    LEFT JOIN team_members tm2
        ON c2.customer_id = tm2.customer_id
        AND tm1.email = tm2.email

WHERE
    -- Criteria 1: Similar company names (case-insensitive, space-removed comparison)
    LOWER(REPLACE(c1.company_name, ' ', '')) = LOWER(REPLACE(c2.company_name, ' ', ''))

    OR
    -- Criteria 2: Same email domain (extract text after @ symbol)
    SUBSTRING_INDEX(c1.contact_email, '@', -1) = SUBSTRING_INDEX(c2.contact_email, '@', -1)

    OR
    -- Criteria 3: Shared team member email across both accounts
    tm1.email = tm2.email;


--  Q5 INSIGHTS:

--  Duplicate accounts distort:
--     Customer count metrics
--     Churn rate calculations
--     Revenue per customer analysis
--
-- Shared team members = strongest duplicate signal
--     Same employee cannot work for two different companies
--     Merge these accounts immediately

-- Same email domain = possible subsidiary or branch
--     May be legitimate separate accounts
--     Requires manual review before merging

-- Similar company names = possible typo or alternate spelling
--     Cross-reference with email domain for confirmation

-- Recommended Actions:
--    Flag all matches for manual data team review
--    Merge confirmed duplicates to clean customer master data
--    Add unique constraints on email domain + company name combination
