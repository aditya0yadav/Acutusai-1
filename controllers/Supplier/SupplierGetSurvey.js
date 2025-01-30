// const { Survey, Condition, Quotas, Qualification } = require("../../models/association");
const { ResearchSurvey, ResearchSurveyQuota, ResearchSurveyQualification } = require('../../models/uniqueSurvey');
const { RateEntry } = require("../../models/SupplierRateCard");
const sequelize = require("../../config");
const { Op } = require("sequelize");
const crypto = require("crypto");
const Supply = require('../../models/supplyModels');
const QualificationModel = require("../../models/USQualification");

function generateApiUrl(
  survey_id,
  supply_id = "SupplyID",
  AID = "AID",
  Session_id = "sessionID",
  TID = "TokenID"
) {
  const baseUrl = "https://api.qmapi.com/api/v2/survey/redirect";
  const queryParams = `SupplyID=[%${encodeURIComponent(
    supply_id
  )}%]&PNID=[%${encodeURIComponent(AID)}%]&SessionID=[%${encodeURIComponent(
    Session_id
  )}%]&TID=[%${encodeURIComponent(TID)}%]`;
  return `${baseUrl}/${survey_id}?${queryParams}`;
}

function generateTestUrl(
  survey_id,
  supply_id = "SupplyID",
  AID = "AID",
  Session_id = "sessionID",
  TID = "TokenID"
) {
  const baseUrl = "https://api.qmapi.com/api/v2/survey/redirect";
  const queryParams = `SupplyID=[%${encodeURIComponent(
    supply_id
  )}%]`;
  return `${baseUrl}/${survey_id}/test?${queryParams}`;
}



exports.getAllSurveys = async (req, res) => {
  try {
    // Retrieve all surveys from the database
    const surveys = await Survey.findAll();

    // Respond with the list of surveys
    res.status(200).json({
      status: "success",
      data: surveys,
    });
  } catch (err) {
    // Handle any errors that occur during the retrieval process
    console.error("Error fetching surveys:", err);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};

// exports.getAllSurveysDetail = async (req, res) => {
//   try {
//     const { id } = req.params;
//     console.log("idea", id);

//     const surveys = await Survey.findAll({
//       where: {
//         id: id,
//       },
//     });

//     if (surveys.length === 0) {
//       return res.status(404).json({
//         status: "not found",

//         message: "No survey found with the given ID",
//       });
//     }

//     res.status(200).json({
//       status: "success",
//       data: surveys[0],
//     });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({
//       status: "error",
//       message: "An error occurred while fetching the surveys",
//       error: err.message,
//     });
//   }
// };

// Handle request to get all live surveys
const RateCard = require("../../models/SupplierRateCard");

const generateCPI = async (IR, LOI, apiKey) => {
  try {
    console.log("hhsd", apiKey);
    const sup = await Supply.findOne({
      where: {
        ApiKey: apiKey
      }
    })

    console.log(sup.SupplierID)
    const rateCard = await RateCard.findOne({
      where: {
        IR: LOI,
        SupplyID: sup.SupplierID,

      },
    });

    console.log(rateCard);

    // Return some calculated CPI based on rateCard
    return rateCard ? rateCard.get('IR') : null;
  } catch (err) {
    console.error("Error in generateCPI:", err);
    return null; // Return null or a default value in case of error
  }
};

const processSurvey = async (survey, apiKey) => {
  const { id, IR, LOI, ...surveyData } = survey.toJSON();

  // Generate Survey CPI using the async function and pass the API key
  const SurveyCPI = await generateCPI(IR, LOI, apiKey);

  return {
    ...surveyData,
    id,
    LiveURL: generateApiUrl(id),
    TestURL: generateApiUrl(id),
    SurveyCPI,  // Append SurveyCPI to the result
  };
};

async function getRate(rateCard, LOI, IR) {
  try {
    console.log("Transfer", rateCard, LOI, IR);

    const rateEntries = await RateEntry.findOne({
      where: {
        rateCardId: rateCard,
        irMin: { [Op.lte]: IR },
        irMax: { [Op.gte]: IR },
        loiMin: { [Op.lte]: LOI },
        loiMax: { [Op.gte]: LOI },
      },
    });

    if (!rateEntries) {
      throw new Error(`Rate not found for IR ${IR} and LOI ${LOI} in rate card ${rateCard}`);
    }

    console.log(rateEntries.rate);
    return rateEntries.rate;
  } catch (error) {
    console.error("Error in getRate:", error.message);
    throw error;
  }
}

const NodeCache = require("node-cache");
const surveyCache = new NodeCache({ stdTTL: 100, checkperiod: 600 }); // Cache with TTL of 1 hour
exports.getLiveSurveys = async (req, res) => {
  const apiKey = req.headers.authorization;
  const { limit, greatercpi, lowercpi, exactcpi, loi, ir, country } = req.query;

  if (!apiKey) {
    return res.status(403).json({ message: "No API key provided" });
  }

  try {
    const Rate = await Supply.findOne({
      attributes: ["apikey", "RateCard", "SupplierID"],
      where: { ApiKey: apiKey },
    });

    if (!Rate) {
      return res.status(403).json({ message: "Invalid API key" });
    }

    const { SupplierID: SupplyId, RateCard } = Rate;

    const cacheKey = `liveSurveys:${SupplyId}:${JSON.stringify(req.query)}`;
    let surveys = surveyCache.get(cacheKey);

    if (!surveys) {
      console.log("Cache miss, fetching from database...");

      // Map country codes to country_language values
      const countryLanguageMap = {
        'US': 'eng_us',
        'IN': 'eng_in',
        // Add more mappings as needed
      };

      // Build the where clause
      const whereClause = {
        is_live: 1,
        message_reason: { [Op.ne]: "deactivated" },
        livelink: { [Op.ne]: "" },
      };

      // Add LOI (Length of Interview) filter if provided
      if (loi) {
        whereClause.bid_length_of_interview = loi;
      }

      // Add IR (Incidence Rate) filter if provided
      if (ir) {
        whereClause.bid_incidence = ir;
      }

      // Add country and country_language filter if country is provided
      if (country) {
        whereClause.country = country;
        if (countryLanguageMap[country]) {
          whereClause.country_language = countryLanguageMap[country];
        }
      }

      surveys = await ResearchSurvey.findAll({
        attributes: { exclude: ["account_name", "survey_name"] },
        where: whereClause,
        include: [
          {
            model: ResearchSurveyQuota,
            as: "survey_quotas",
            attributes: { exclude: ["quota_cpi"] },
          },
          {
            model: ResearchSurveyQualification,
            as: "survey_qualifications",
          },
        ],
        limit: limit || 200,
        raw: false
      });

      const processedSurveys = await Promise.all(surveys.map(async (survey) => {
        const { bid_length_of_interview: LOI, bid_incidence: IR, revenue_per_interview } = survey;
        
        // Safely parse revenue_per_interview
        let normalCPI;
        try {
          const cut = revenue_per_interview;
          normalCPI = Number(cut.value);
        } catch (error) {
          console.error('Error parsing revenue_per_interview:', error);
          normalCPI = 0;
        }

        const percent = Math.round(normalCPI * 0.6 * 10) / 10;
        let value = percent;

        // Calculate rate for specific supplier
        if (SupplyId === 2580) {
          try {
            value = await getRate(RateCard, LOI, IR);
          } catch (rateError) {
            console.error('Rate calculation error:', rateError);
            return null;
          }
        }

        // Skip surveys where the value is not greater than CPI for specific supplier
        if (value >= normalCPI && SupplyId == 2580) {
          return null;
        }

        // Apply CPI filters
        if (greatercpi && value <= Number(greatercpi)) {
          return null;
        }
        if (lowercpi && value >= Number(lowercpi)) {
          return null;
        }
        if (exactcpi && value !== Number(exactcpi)) {
          return null;
        }

        // Process qualifications
        const qualifications = await Promise.all(
          (survey.survey_qualifications || []).map(async (qualification) => {
            try {
              const questionDetails = await QualificationModel.findOne({
                where: { question_id: qualification.question_id },
                attributes: ["name", "question", "question_id", "Acutusai"],
              });

              return {
                ...qualification.toJSON(),
                question_id: questionDetails
                  ? questionDetails.Acutusai || qualification.question_id
                  : qualification.question_id,
              };
            } catch (qualError) {
              console.error('Qualification processing error:', qualError);
              return qualification.toJSON();
            }
          })
        );

        const surveyData = survey.toJSON();
        delete surveyData.revenue_per_interview;

        return {
          ...surveyData,
          cpi: value,
          livelink: generateApiUrl(survey.survey_id),
          testlink: generateTestUrl(survey.survey_id),
          survey_qualifications: qualifications,
        };
      }));

      // Filter out null values
      const validSurveys = processedSurveys.filter(survey => survey !== null);

      surveyCache.set(cacheKey, validSurveys);
      surveys = validSurveys;
    } else {
      console.log("Cache hit, returning data...");
    }

    res.status(200).json({
      status: "success",
      data: surveys,
    });
  } catch (err) {
    console.error("Error in getLiveSurveys:", err);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
      error: err.message,
    });
  }
};

exports.getFinishedSurveys = async (req, res) => {
  try {
    // Retrieve surveys with status "finished"
    const surveys = await Survey.findAll({
      where: {
        status: "finished",
      },
    });

    res.status(200).json({
      status: "success",
      data: surveys,
    });
  } catch (err) {
    console.error("Error fetching finished surveys:", err);
    res.status(500).json({
      status: "error",
      message: "Internal server error",
    });
  }
};
