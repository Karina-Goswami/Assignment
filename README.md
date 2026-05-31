# Customer Churn & Retention Analysis

> A full-stack data analysis project combining **PostgreSQL/MySQL**, **MongoDB**, **Python**, and **Power BI** to uncover churn patterns, retention signals, and actionable business insights for a SaaS company.

---

##  Project Overview

### Problem Statement
A SaaS company is experiencing significant customer churn across multiple subscription tiers. The business needs to understand:
- **Who** is churning and **why**
- **When** customers are most likely to churn
- **What** behavioral signals predict churn early
- **How** to retain high-value customers

### Approach
This project combines **two data sources**:
- **SQL (MySQL)** → Transactional data: subscriptions, billing, support tickets
- **MongoDB** → Behavioral data: user activity, NPS surveys, onboarding events

These are analyzed through **4 tasks**:

```
Task 1 → SQL Queries         (MySQL)
Task 2 → MongoDB Pipelines   (Aggregation Framework)
Task 3 → Python Analysis     (Cleaning + ML + Statistics)
Task 4 → Power BI Dashboard  (Interactive Storytelling)
```

### Business Questions Answered
```
 Which plan tiers have the highest churn rate?
 Does low engagement predict churn?
 Which countries churn the most?
 What is the trial-to-paid conversion rate?
 Which customers are high-value upsell targets?
 What onboarding steps have the highest drop-off?
 How does billing cycle affect churn?
 Which customers downgraded after high support usage?
```



### Page 1 — Customer Churn & Retention Overview
![Dashboard Overview](screenshots/dashboard_overview.png)

### Dashboard Highlights
| Metric | Value |
|---|---|
|  Total Revenue | ₹41,65,888 |
|  Total MRR | $53,039 |
|  Total Customers | 1,204 |
|  Active Customers | 938 |
|  Churned Customers | 266 |
|  Churn Rate | 22.09% |
|  Avg NPS Score | 6.86 |
|  Trial Conversion | 67.6% |
|  Lost MRR | $24,214 |
|  Retention FY25-26 | 80.6% |

---
<img width="852" height="731" alt="image" src="https://github.com/user-attachments/assets/54e54022-ca8d-4fde-8348-b79a8d8789c2" />

##  Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Relational DB** | MySQL| Customer, subscription, billing data |
| **NoSQL DB** | MongoDB | User activity, surveys, onboarding |
| **Data Processing** | Python 3.9+ | Cleaning, EDA, statistics, ML |
| **Visualization** | Power BI Desktop | Interactive dashboard |
| **SQL Queries** | MySQL / PostgreSQL | Business analytics queries |
| **NoSQL Queries** | MongoDB Aggregation | Behavioral analytics pipelines |

### Python Libraries
```
pandas        → Data manipulation and CSV export
numpy         → Numerical operations
pymongo       → MongoDB connection
sqlalchemy    → MySQL connection
scipy         → Statistical hypothesis testing
scikit-learn  → KMeans clustering, StandardScaler
jupyter       → Notebook environment
```

---
### SQL Tables

| Table | Rows | Description | Key Columns |
|---|---|---|---|
| `customers` | 1,204 | Customer master data | customer_id, company_name, industry, is_active, churned_at |
| `subscriptions` | 1,840 | Subscription records | subscription_id, plan_id, mrr_usd, is_churned, billing_cycle |
| `plans` | 8 | Plan configuration | plan_id, plan_name, plan_tier, monthly_price_usd |
| `billing_invoices` | ~5,000 | Invoice records | invoice_id, amount_usd, total_usd, is_paid, paid_at |
| `support_tickets` | ~3,000 | Support history | ticket_id, customer_id, created_at, status |
| `team_members` | ~4,000 | Team member info | member_id, customer_id, role, last_login_at |
| `feature_flags` | ~500 | Feature access | flag_id, plan_id, feature_key, is_enabled |

### MongoDB Collections

| Collection | Description | Key Fields |
|---|---|---|
| `user_activity_logs` | Session events | customer_id, event_type, session_duration_sec, timestamp |
| `nps_survey_responses` | NPS feedback | customer_id, nps_score, feedback, survey_date |
| `onboarding_events` | Onboarding funnel | customer_id, step, timestamp, completed |

---

## Setup & Installation

### Prerequisites
```
Python 3.9+
MySQL 8.0+ or PostgreSQL 13+
MongoDB 6.0+
Power BI Desktop (Windows only)
Jupyter Notebook

---
##  Analysis Tasks

### Task 1 — SQL Queries

| # | Query | Technique | Business Value |
|---|---|---|---|
| Q1 | Plan-wise active customers, avg revenue & ticket rate | JOIN + GROUP BY | Identify high-support plans |
| Q2 | Customer LTV ranking + % diff from tier average | Window Functions (RANK, AVG OVER) | Find VIP customers |
| Q3 | Downgraded customers with 3+ tickets in 30 days prior | CTE + LAG + HAVING | Early churn warning |
| Q4 | MOM subscription growth + rolling 3-month churn rate | CTE + LAG + ROWS BETWEEN | Trend & anomaly detection |
| Q5 | Duplicate account detection | Self JOIN + SUBSTRING_INDEX | Data quality assurance |

### Task 2 — MongoDB Pipelines

| # | Pipeline | Technique | Business Value |
|---|---|---|---|
| Q1 | Avg sessions/user/week by tier + percentile durations | $group + $percentile + $reduce | Engagement benchmarks |
| Q2 | DAU per feature + 7-day retention rate | $group + $lookup + $cond | Feature stickiness |
| Q3 | Onboarding funnel drop-off + median step times | $filter + $percentile | Friction point detection |
| Q4 | Top 20 free tier upsell targets by engagement score | Weighted scoring + $limit | Revenue growth opportunity |

### Task 3 — Python Analysis

| Section | Method | Output |
|---|---|---|
| Data Cleaning | IQR outlier removal, median imputation | 10 clean CSV files |
| Feature Engineering | Boolean flags, engagement score, time features | Enriched DataFrame |
| Hypothesis 1 | Welch's t-test: engagement vs churn | p-value, reject/accept H0 |
| Hypothesis 2 | Welch's t-test: paid vs free engagement | p-value, reject/accept H0 |
| Segmentation | KMeans (k=3) + StandardScaler | 3 customer segments |

### Task 4 — Power BI Dashboard

| Page | Visuals | Key Metric |
|---|---|---|
| Overview | Donut, Map, Matrix, Bar, Line, Funnel, Table | Churn Rate 22.09% |
| Churn Analysis | Bar, Treemap, Line, Funnel | Lost MRR $24,214 |
| Retention Analysis | Line, Waterfall, Scatter, Matrix | Retention 80.6% |

---

##  Key Findings

### Churn Analysis
```
 Enterprise Custom → 27.78% churn rate (Highest)
   Only 31 customers but highest support ticket dependency

 Free Plan → 27.12% churn + $0 MRR
   390 customers generating no revenue

 Starter Plus → 15.56% churn rate (Lowest)
   Best price-to-value ratio across all plans

 Churn peaked at 24.2% in FY 2023-24
   Improved to 19.4% in FY 2025-26
```

### Revenue Analysis
```
Total MRR         = $53,039
Lost MRR to Churn = $24,214  (45.7% at risk!)
Professional plan = Highest MRR contributor
Enterprise        = Highest avg MRR per customer
```

### Retention Analysis
```
 Retention improving year over year:
   FY 2022-23 → 78.5%
   FY 2023-24 → 75.8%  ← Dip (investigate!)
   FY 2024-25 → 78.6%
   FY 2025-26 → 80.6%  ← Best year!
```

### Trial Conversion
```
Total Customers    = 1,204
Total Trial Users  =   818  (67.9% tried product)
Converted to Paid  =   553  (67.6% trial conversion)
Overall Rate       = 45.9%  signup to paid
```

### NPS Sentiment
```
Overall NPS Score = 6.86 / 10
Best Plan NPS     = Professional (7.01)
Worst Plan NPS    = Enterprise Custom (6.57)
→ Low NPS = High churn risk signal
```

---

## Recommendations

###  Recommendation 1 — Rescue Enterprise Custom Accounts
> **Problem:** 27.78% churn rate — highest of all plans
>
> **Action:**
> - Assign dedicated Customer Success Manager to each account
> - Schedule monthly check-in calls
> - Create custom onboarding and training program
>
> **Expected Impact:** Reducing churn by 10% = ~$268/month MRR saved

---

###  Recommendation 2 — Convert Free Users to Paid
> **Problem:** 390 free users, $0 MRR, 27.12% churn
>
> **Action:**
> - Launch **30-day Professional trial** for free users with engagement score > 0.6
> - Show in-app upgrade prompts when users hit free tier limits
> - Email campaign: "You've used X features — unlock Y with Pro"
>
> **Expected Impact:** Converting 10% of free users = ~$3,600 new MRR

---

###  Recommendation 3 — Promote Annual Billing
> **Problem:** Monthly billing customers churn significantly more than annual
>
> **Action:**
> - Offer **15-20% discount** to monthly customers at 3-month anniversary
> - Show annual savings calculator on billing page
> - Default new signups to annual billing with monthly opt-out
>
> **Expected Impact:** Annual customers show 40%+ lower churn = direct MRR protection

---
