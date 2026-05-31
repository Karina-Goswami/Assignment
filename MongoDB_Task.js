// PROJECT  : Customer Churn & Retention Analysis

// Show all available collections in the database
show collections

db.user_activity_logs.find().limit(5)


// Q1: Average Sessions Per User Per Week by Subscription Tier
//     + 25th, 50th, 75th Percentile Session Durations

// Question:
//    How frequently do users in each subscription tier
//    use the product per week? What is the session duration
//    distribution across tiers?

db.user_activity_logs.aggregate([
  {
    $project: {
      customer_id: 1,
      timestamp: 1,
      week: { $week: "$timestamp" },
      year: { $year: "$timestamp" }
    }
  },
  { $limit: 2 }
])



// Q1 MAIN PIPELINE

db.user_activity_logs.aggregate([

  // STEP 1: Convert timestamp string to Date object 

  {
    $addFields: {
      converted_timestamp: {
        $toDate: "$timestamp"
      }
    }
  },

  // STEP 2: Extract week number and year from timestamp 

  {
    $addFields: {
      week: { $week: "$converted_timestamp" },
      year: { $year: "$converted_timestamp" }
    }
  },

  // STEP 3: Group by customer + week + subscription tier 
  // Count sessions per user per week
  {
    $group: {
      _id: {
        customer_id: "$customer_id",
        subscription_tier: "$subscription_tier",
        week: "$week",
        year: "$year"
      },
      sessions_per_week: { $sum: 1 },          
      durations: { $push: "$session_duration_sec" }     }
  },

  // STEP 4: Group by subscription tier
  {
    $group: {
      _id: "$_id.subscription_tier",
      avg_sessions_per_user_per_week: { $avg: "$sessions_per_week" },
      all_durations: { $push: "$durations" }    // Array of arrays → needs flattening
    }
  },

  // STEP 5: Flatten nested duration arrays 
    {
    $project: {
      avg_sessions_per_user_per_week: 1,
      durations_flat: {
        $reduce: {
          input: "$all_durations",
          initialValue: [],
          in: { $concatArrays: ["$$value", "$$this"] }          }
      }
    }
  },

  //  STEP 6: Calculate percentile session durations 
 
  // p: [0.25] → 25th percentile (bottom quarter of session lengths)
  // p: [0.50] → Median session duration
  // p: [0.75] → 75th percentile (top quarter of session lengths)
  // $arrayElemAt [result, 0] → Extract single value from result array

  {
    $project: {
      avg_sessions_per_user_per_week: { $round: ["$avg_sessions_per_user_per_week", 2] },

      // 25th Percentile → Short sessions (quick check-ins)
      p25_session_duration: {
        $arrayElemAt: [
          { $percentile: { input: "$durations_flat", p: [0.25], method: "approximate" } },
          0
        ]
      },

      // 50th Percentile (Median) → Typical session length
      p50_session_duration: {
        $arrayElemAt: [
          { $percentile: { input: "$durations_flat", p: [0.50], method: "approximate" } },
          0
        ]
      },

      // 75th Percentile → Long sessions (power users)
      p75_session_duration: {
        $arrayElemAt: [
          { $percentile: { input: "$durations_flat", p: [0.75], method: "approximate" } },
          0
        ]
      }
    }
  }
])

// Q1 INSIGHTS:

// Higher avg sessions per week = more engaged tier
//    Enterprise/Professional should show higher engagement
//    Free tier low sessions = upsell opportunity
//
// p75 vs p25 gap shows session duration spread
//     Large gap = inconsistent usage patterns
//     Small gap = consistent user behavior
//
// Low p50 (median) for free tier = low product value realization
//     Target these users with feature discovery campaigns



// Q2: Daily Active Users (DAU) + 7-Day Feature Retention Rate

// Question:
//    For each product feature, how many unique users engage daily?
//    What percentage of users return to use the feature again
//    within 7 days of their first use?


// Daily Active Users (DAU) per Feature 
// Purpose: How many unique users use each feature every day?

db.user_activity_logs.aggregate([

  // STEP 1: Convert timestamp string to Date
  {
    $addFields: {
      converted_timestamp: { $toDate: "$timestamp" }
    }
  },

  // STEP 2: Group by feature + day + customer
  // Purpose: Get unique users per feature per day
  {
    $group: {
      _id: {
        feature: "$event_type",
        day: {
          $dateToString: {
            format: "%Y-%m-%d",
            date: "$converted_timestamp"
          }
        },
        customer_id: "$customer_id"                   }
    }
  },

  // STEP 3: Count unique users per feature per day
  {
    $group: {
      _id: {
        feature: "$_id.feature",
        day: "$_id.day"
      },
      daily_active_users: { $sum: 1 }              }
  },

  // STEP 4: Sort by date ascending for time series view
  { $sort: { "_id.day": 1 } }
])


// 7-Day Feature Retention Rate 
// Purpose: What % of users come back to a feature within 7 days?

db.user_activity_logs.aggregate([

  // STEP 1: Convert timestamp to Date
  {
    $addFields: {
      converted_timestamp: { $toDate: "$timestamp" }
    }
  },

  // STEP 2: Find first use date per customer per feature
  {
    $group: {
      _id: {
        customer_id: "$customer_id",
        feature: "$event_type"
      },
      first_use_date: { $min: "$converted_timestamp" }
    }
  },

  // STEP 3: Lookup repeated usage within 7 days of first use
  
  {
    $lookup: {
      from: "user_activity_logs",               
      let: {
        customer_id: "$_id.customer_id",
        feature: "$_id.feature",
        first_use: "$first_use_date"
      },
      pipeline: [
        {
          $addFields: {
            converted_timestamp: { $toDate: "$timestamp" }
          }
        },
        {
          $match: {
            $expr: {
              $and: [
                // Same customer
                { $eq: ["$customer_id", "$$customer_id"] },
                // Same feature
                { $eq: ["$event_type", "$$feature"] },
                // After first use (not the same event)
                { $gt: ["$converted_timestamp", "$$first_use"] },
                // Within 7 days of first use
                {
                  $lte: [
                    "$converted_timestamp",
                    {
                      $dateAdd: {
                        startDate: "$$first_use",
                        unit: "day",
                        amount: 7               
                      }
                    }
                  ]
                }
              ]
            }
          }
        }
      ],
      as: "retained_users"                          }
  },

  // STEP 4: Create retention flag (1 = retained, 0 = not retained)
  {
    $project: {
      feature: "$_id.feature",
      retained: {
        $cond: [
          { $gt: [{ $size: "$retained_users" }, 0] },
          1,                                  
          0                                    
        ]
      }
    }
  },

  // STEP 5: Calculate retention rate per feature
  {
    $group: {
      _id: "$feature",
      total_users: { $sum: 1 },                 
      retained_count: { $sum: "$retained" },     
      retention_rate: { $avg: "$retained" }      
    }
  },

  // STEP 6: Convert to percentage and sort by retention rate
  {
    $project: {
      feature: "$_id",
      total_users: 1,
      retained_count: 1,
      retention_rate_percentage: {
        $round: [{ $multiply: ["$retention_rate", 100] }, 2]
      }
    }
  },

  // Sort by highest retention rate first
  { $sort: { retention_rate_percentage: -1 } }
])

//  Q2 INSIGHTS:
// High DAU features = core product value drivers
//    Protect these features from UX changes

// High retention rate features = sticky features
//    Promote these to free tier users to drive conversion

// Low retention rate features = adoption problem
//    Improve onboarding/tutorials for these features

// High DAU + Low retention = users try but don't stick
//     Feature may have UX issues or unclear value


// Q3: Onboarding Funnel Analysis

// Question:
//    How many users complete each onboarding step?
//    Where do users drop off in the onboarding flow?
//    How long does it take to move between steps?

db.user_activity_logs.aggregate([

  // STEP 1: Convert timestamp to Date
  {
    $addFields: {
      converted_timestamp: { $toDate: "$timestamp" }
    }
  },

  // STEP 2: Filter only onboarding-related events
  {
    $match: {
      event_type: {
        $in: [
          "signup",
          "first_login",
          "workspace_created",
          "first_project",
          "invited_teammate"
        ]
      }
    }
  },

  // STEP 3: Get first occurrence of each step per customer
  
  {
    $group: {
      _id: {
        customer_id: "$customer_id",
        step: "$event_type"
      },
      step_time: { $min: "$converted_timestamp" }   
    }
  },

  // STEP 4: Group all steps per customer into a single document
 
  {
    $group: {
      _id: "$_id.customer_id",
      steps: {
        $push: {
          step: "$_id.step",
          step_time: "$step_time"
        }
      }
    }
  },

  // STEP 5: Extract each funnel step timestamp using $filter
  
  {
    $project: {
      customer_id: "$_id",

      // Signup step timestamp (funnel entry point)
      signup_time: {
        $arrayElemAt: [
          {
            $filter: {
              input: "$steps",
              as: "s",
              cond: { $eq: ["$$s.step", "signup"] }
            }
          },
          0
        ]
      },

      // First login step timestamp
      first_login_time: {
        $arrayElemAt: [
          {
            $filter: {
              input: "$steps",
              as: "s",
              cond: { $eq: ["$$s.step", "first_login"] }
            }
          },
          0
        ]
      },

      // Workspace created step timestamp
      workspace_time: {
        $arrayElemAt: [
          {
            $filter: {
              input: "$steps",
              as: "s",
              cond: { $eq: ["$$s.step", "workspace_created"] }
            }
          },
          0
        ]
      },

      // First project created step timestamp
      project_time: {
        $arrayElemAt: [
          {
            $filter: {
              input: "$steps",
              as: "s",
              cond: { $eq: ["$$s.step", "first_project"] }
            }
          },
          0
        ]
      },

      // Invited teammate step timestamp (final funnel step)
      teammate_time: {
        $arrayElemAt: [
          {
            $filter: {
              input: "$steps",
              as: "s",
              cond: { $eq: ["$$s.step", "invited_teammate"] }
            }
          },
          0
        ]
      }
    }
  },

  // STEP 6: Calculate funnel completion flags and time between steps
 
  {
    $project: {
      customer_id: 1,

      // Completion flags for each step
      did_signup: { $cond: [{ $ifNull: ["$signup_time", false] }, 1, 0] },
      did_first_login: { $cond: [{ $ifNull: ["$first_login_time", false] }, 1, 0] },
      did_workspace: { $cond: [{ $ifNull: ["$workspace_time", false] }, 1, 0] },
      did_project: { $cond: [{ $ifNull: ["$project_time", false] }, 1, 0] },
      did_teammate: { $cond: [{ $ifNull: ["$teammate_time", false] }, 1, 0] },

      // Time from signup → first_login (seconds)
      time_signup_to_login: {
        $cond: [
          { $and: [{ $ifNull: ["$signup_time.step_time", false] }, { $ifNull: ["$first_login_time.step_time", false] }] },
          {
            $divide: [
              { $subtract: ["$first_login_time.step_time", "$signup_time.step_time"] },
              1000    // Convert milliseconds to seconds
            ]
          },
          null
        ]
      },

      // Time from first_login → workspace_created (seconds)
      time_login_to_workspace: {
        $cond: [
          { $and: [{ $ifNull: ["$first_login_time.step_time", false] }, { $ifNull: ["$workspace_time.step_time", false] }] },
          {
            $divide: [
              { $subtract: ["$workspace_time.step_time", "$first_login_time.step_time"] },
              1000
            ]
          },
          null
        ]
      },

      // Time from workspace_created → first_project (seconds)
      time_workspace_to_project: {
        $cond: [
          { $and: [{ $ifNull: ["$workspace_time.step_time", false] }, { $ifNull: ["$project_time.step_time", false] }] },
          {
            $divide: [
              { $subtract: ["$project_time.step_time", "$workspace_time.step_time"] },
              1000
            ]
          },
          null
        ]
      },

      // Time from first_project → invited_teammate (seconds)
      time_project_to_teammate: {
        $cond: [
          { $and: [{ $ifNull: ["$project_time.step_time", false] }, { $ifNull: ["$teammate_time.step_time", false] }] },
          {
            $divide: [
              { $subtract: ["$teammate_time.step_time", "$project_time.step_time"] },
              1000
            ]
          },
          null
        ]
      }
    }
  },

  // STEP 7: Aggregate funnel totals and median times
  {
    $group: {
      _id: null,                                      
      total_signup: { $sum: "$did_signup" },
      total_first_login: { $sum: "$did_first_login" },
      total_workspace: { $sum: "$did_workspace" },
      total_project: { $sum: "$did_project" },
      total_teammate: { $sum: "$did_teammate" },

      // Collect time differences for median calculation
      times_signup_to_login: { $push: "$time_signup_to_login" },
      times_login_to_workspace: { $push: "$time_login_to_workspace" },
      times_workspace_to_project: { $push: "$time_workspace_to_project" },
      times_project_to_teammate: { $push: "$time_project_to_teammate" }
    }
  },

  // STEP 8: Calculate drop-off rates and median times
  {
    $project: {
      funnel_summary: {
        signup: "$total_signup",
        first_login: "$total_first_login",
        workspace_created: "$total_workspace",
        first_project: "$total_project",
        invited_teammate: "$total_teammate"
      },

      // Drop-off rate = % of users who did NOT proceed to next step
      dropoff_rates: {
        signup_to_login: {
          $round: [
            {
              $multiply: [
                { $subtract: [1, { $divide: ["$total_first_login", "$total_signup"] }] },
                100
              ]
            },
            2
          ]
        },
        login_to_workspace: {
          $round: [
            {
              $multiply: [
                { $subtract: [1, { $divide: ["$total_workspace", "$total_first_login"] }] },
                100
              ]
            },
            2
          ]
        },
        workspace_to_project: {
          $round: [
            {
              $multiply: [
                { $subtract: [1, { $divide: ["$total_project", "$total_workspace"] }] },
                100
              ]
            },
            2
          ]
        },
        project_to_teammate: {
          $round: [
            {
              $multiply: [
                { $subtract: [1, { $divide: ["$total_teammate", "$total_project"] }] },
                100
              ]
            },
            2
          ]
        }
      },

      // Median time between each funnel step (in seconds)
      median_times_seconds: {
        signup_to_login: {
          $arrayElemAt: [
            {
              $percentile: {
                input: "$times_signup_to_login",
                p: [0.50],
                method: "approximate"
              }
            },
            0
          ]
        },
        login_to_workspace: {
          $arrayElemAt: [
            {
              $percentile: {
                input: "$times_login_to_workspace",
                p: [0.50],
                method: "approximate"
              }
            },
            0
          ]
        },
        workspace_to_project: {
          $arrayElemAt: [
            {
              $percentile: {
                input: "$times_workspace_to_project",
                p: [0.50],
                method: "approximate"
              }
            },
            0
          ]
        },
        project_to_teammate: {
          $arrayElemAt: [
            {
              $percentile: {
                input: "$times_project_to_teammate",
                p: [0.50],
                method: "approximate"
              }
            },
            0
          ]
        }
      }
    }
  }
])

// Q3 INSIGHTS:
// High drop-off at signup → first_login
//    Email verification friction or poor onboarding email
//     Fix: Simplify login process, add welcome email sequence
//
// High drop-off at workspace_created → first_project
//     Users don't know how to create first project
//     Fix: Add interactive product tour at workspace creation
//
// Long median time between steps = friction points
//    Steps taking > 24 hours need immediate UX improvement
//
// invited_teammate = strongest retention signal
//     Users who invite teammates have 3x higher retention
//     Fix: Prompt teammate invitation earlier in onboarding


// Q4: Top 20 Most Engaged Free Tier Users (Upsell Targets)
// Question:
//    Which free tier users are most engaged with the product?
//    These users show high value realization and are prime
//    candidates for upsell to paid plans.


db.user_activity_logs.aggregate([

  // STEP 1: Convert timestamp to Date
  {
    $addFields: {
      converted_timestamp: { $toDate: "$timestamp" }
    }
  },

  // STEP 2: Filter only free tier users
  // Cross-reference point: customer_ids here match SQL customers table
  {
    $match: {
      subscription_tier: "free"                 
    }
  },

  // STEP 3: Filter last 90 days of activity
  // Recent engagement is more predictive of conversion intent
  {
    $match: {
      converted_timestamp: {
        $gte: new Date(new Date() - 90 * 24 * 60 * 60 * 1000)  // 90 days ago
      }
    }
  },

  // STEP 4: Calculate raw engagement signals per customer
  {
    $group: {
      _id: "$customer_id",

      // Signal 1: Session Frequency (last 90 days)
      total_sessions: { $sum: 1 },

      // Signal 2: Average Session Duration
      avg_session_duration: { $avg: "$session_duration_sec" },

      // Signal 3: Feature Diversity (unique features used)
      unique_features: { $addToSet: "$event_type" },

      // Signal 4: Recency (most recent activity date)
      last_activity: { $max: "$converted_timestamp" }
    }
  },

  // STEP 5: Calculate engagement score components
  {
    $project: {
      customer_id: "$_id",
      total_sessions: 1,
      avg_session_duration: { $round: ["$avg_session_duration", 2] },
      feature_diversity: { $size: "$unique_features" },   
      last_activity: 1,

      // Days since last activity (for recency score)
      days_since_last_activity: {
        $divide: [
          { $subtract: [new Date(), "$last_activity"] },
          1000 * 60 * 60 * 24                          
        ]
      }
    }
  },

  // STEP 6: Calculate weighted engagement score
  // Score components normalized and weighted:
  //   Frequency   : 30% weight → sessions / 10 (normalize to 0-10 scale)
  //   Duration    : 25% weight → avg_duration / 600 (normalize, 600sec = 10min)
  //   Diversity   : 25% weight → unique_features / 2 (normalize to 0-10 scale)
  //   Recency     : 20% weight → (90 - days_since) / 9 (normalize to 0-10 scale)
  {
    $addFields: {
      engagement_score: {
        $round: [
          {
            $add: [

              // Frequency Score: 30% weight
              { $multiply: [{ $divide: ["$total_sessions", 10] }, 0.30] },

              // Duration Score: 25% weight (600 sec = 10 min benchmark)
              { $multiply: [{ $divide: ["$avg_session_duration", 600] }, 0.25] },

              // Diversity Score: 25% weight (20 features = max diversity)
              { $multiply: [{ $divide: ["$feature_diversity", 20] }, 0.25] },

              // Recency Score: 20% weight (inverted days since activity)
              {
                $multiply: [
                  {
                    $divide: [
                      { $subtract: [90, "$days_since_last_activity"] },
                      90                                                    ]
                  },
                  0.20
                ]
              }

            ]
          },
          4                                                   ]
      }
    }
  },

  // STEP 7: Sort by engagement score (highest first)
  { $sort: { engagement_score: -1 } },

  // STEP 8: Return top 20 upsell targets only
  { $limit: 20 },

  // STEP 9: Final output with clean field names
  {
    $project: {
      _id: 0,
      customer_id: 1,                             
      engagement_score: 1,                       
      total_sessions: 1,                          
      avg_session_duration_sec: "$avg_session_duration", // Duration signal
      feature_diversity: 1,                       
      days_since_last_activity: { $round: ["$days_since_last_activity", 1] }, // Recency signal
      last_activity: 1,                           
      upsell_priority: {                          
        $switch: {
          branches: [
            { case: { $gte: ["$engagement_score", 0.7] }, then: " HIGH PRIORITY" },
            { case: { $gte: ["$engagement_score", 0.4] }, then: "MEDIUM PRIORITY" }
          ],
          default: " MONITOR"
        }
      }
    }
  }
])


// Q4 INSIGHTS:

//  HIGH PRIORITY users : Immediate upsell outreach
//    Personal email/call with trial offer
//     Offer 20-30% discount on first paid month
//
//  High feature diversity = high switching cost
//    These users rely on multiple features = less likely to churn
//    Best candidates for annual plan upsell
//
// High session frequency + long duration = product-market fit
//     User has found value in free tier
//     Show them what paid features they are missing
//
//  Cross-reference with SQL:
//     Use customer_id to get company_name, industry, company_size
//     Prioritize enterprise/mid-market companies for higher ACV
//     SQL Query: SELECT * FROM customers WHERE customer_id IN [top 20 IDs]
//
//  Recommended Upsell Actions:
//     Send personalized "You're a power user!" email
//     Show usage stats vs paid tier limits
//     Offer 14-day free trial of Professional plan
//     Assign SDR to top 5 highest-score accounts




