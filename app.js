const express = require("express");
const cors = require("cors");
const app = express();
const {  fetchAllSupplies } = require('./controllers/Supplier/SupplierDetail');
const { fetchSupplyInfo} = require('./controllers/Supplier/SupplierDetail');
const compression = require("compression");
const deviceDetail = require("./controllers/Supplier/deviceData");
const { Op } = require("sequelize");
const {createSupplier} = require("./controllers/Supplier/SupplierDetail")
const { Sequelize } = require("sequelize");
const Question = require("./models/USQualification");
const { ResearchSurvey, ResearchSurveyQuota, ResearchSurveyQualification } = require('./models/uniqueSurvey');
const bodyParser = require('body-parser');
const supplierData = require("./controllers/Supplier/SupplierData")
const surveyDetailController = require("./controllers/Supplier/SupplierDetail");
const Auth = require("./Authenication/BuyerCreate");
const reportingInfo = require("./controllers/Supplier/reporting")
const SupplyAuth = require("./Authenication/SupplierCreate");
const surveyRoutes = require("./Authenication/BuyerAuth");
const detailRoutes = require("./Authenication/SupplyAuth");
const Hook = require("./controllers/Buyer/webHook")
const SupplyInfo = require("./models/supModels");

const SupplyOne = require("./models/supplyModels") ;

const UserInfo = require("./controllers/Supplier/token");
const UQualification = require("./models/USQualification")
const { fetchAllResearchSurveys } = require('./controllers/Supplier/SupplierDetail')
const { fetchAllUserProfiles } = require("./controllers/Supplier/SupplierDetail")
const { fetchAllSurveyStatuses } = require('./controllers/Supplier/SupplierDetail');
const { addStatus, updateRedirectStatus, getProfile, updateProfile, registerUser, loginUser, deleteAccount, addData, getPoint } = require('./controllers/Supplier/SupplierOpiniomea');
const SupplyAuthChecker = async (req, res, next) => {
    console.log(req.headers);
    const ApiKey = req.headers["authorization"];
    // console.log(Supply);
    
    try {
        const SupplyData = await SupplyOne.findOne({ where: { ApiKey } }); // Fixed variable name
        if (SupplyData) {
            next();
        } else {
            res.status(401).json({ message: "Unauthenticated" });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error", err });
    }
};


console.log(process.memoryUsage());
app.use(cors());
app.set("trust proxy", true);
// app.use(express.json()
app.use(bodyParser({limit: '50mb'}));
app.use(compression());
app.post('/api/p/profiles', updateProfile);
app.post('/api/status/:id', addStatus);
app.get('/api/redirect/:status', updateRedirectStatus);
app.post('/api/opiniomea/data', addData);
app.get('/api/point', getPoint) ;
app.get('/api/profiles', getProfile);
app.delete('/api/p/profiles/delete', deleteAccount);
app.post('/api/register', registerUser);
app.post('/api/login', loginUser);

async function fetchLinksFromLucid(survey_id) {
  const url = `https://api.samplicio.us/Supply/v1/SupplierLinks/BySurveyNumber/${survey_id}/6588`;
    const params = { 'SupplierLinkTypeCode': 'OWS', 'TrackingTypeCode': 'NONE' };

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': 'A8B96D8F-AB75-4C8C-B692-BE7AC2665BA7',
    'Accept': 'text/plain'
  };

  try {
    const response = await axios.get(url, params=params, { headers });
    
    if (response.status === 200 && response.data && response.data.SupplierLink) {
      const { LiveLink, TestLink } = response.data.SupplierLink;
      return {
        livelink: LiveLink || null,
        testlink: TestLink || null
      };
    }
    
    console.error('Failed to fetch links:', response.data);
    return { livelink: null, testlink: null };
  } catch (error) {
    console.error('Error fetching links from Lucid:', error.message);
    return { livelink: null, testlink: null };
  }
}

app.get("/gh", async (req, res) => {
  try {
    // Fetch all surveys with a null livelink
    const surveys = await ResearchSurvey.findAll({
      attributes: ["livelink", "testlink", "survey_id"],
      where: {
        livelink: null
      },
      limit: 400
    });


    if (!surveys || surveys.length === 0) {
      return res.json({ status: "success", message: "No surveys to update" });
    }

    // Process each survey to fetch links and update the database
    const updatedSurveys = await Promise.all(
      surveys.map(async (survey) => {
        const surveyData = survey.toJSON();
        
        // Fetch livelink and testlink from external API
        const { livelink, testlink } = await fetchLinksFromLucid(surveyData.survey_id);

        // Update survey in the database
        await ResearchSurvey.update(
          {
            livelink,
            testlink
          },
          {
            where: {
              survey_id: surveyData.survey_id
            }
          }
        );

        return {
          survey_id: surveyData.survey_id,
          livelink,
          testlink
        };
      })
    );

    res.json({ 
      status: "success", 
      updatedSurveys,
      count: updatedSurveys.length
    });
  } catch (error) {
    console.error("Error processing surveys:", error);
    res.status(500).json({ 
      status: "error", 
      message: "Internal server error",
      error: error.message 
    });
  }
});
app.get("/ad", async (req, res) => {
  try {
    const rest = await UQualification.findAll({
      attributes: { exclude: ["id"] },
      where: {
        country_language_code: "ENG-US",
      },
    });
    res.status(200).json(rest);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const associate = async (value, score, survey_qualifications,survey_id,earnings_per_click,livelink) => {
  let marks = 0; 
  survey_qualifications.forEach((item) => {
    const question_id = item.question_id;
    const precodes = item.precodes;


    if (question_id in score ){
      if (precodes.includes(String(score[question_id]))){
        marks += 1
        // console.log(marks)
      }
    }
  });

  if (marks > 0) {
    value["survey_id"] = survey_id;
    value["score"] = marks;
    value["earnings_per_click"] = earnings_per_click
    value["livelink"] = livelink
  }

  return value;
};

const axios = require("axios");
const { literal } = require("sequelize");

const enhanceDataWithAI = async (originalData) => {
  try {
    
    const enhancedPrompt = generateAIPrompt(originalData);
    console.log("Sending data to Gemini API for enhancement...");

    // Call the Gemini API
    const response = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=AIzaSyCcr8sTqsAvkBSTpCOZMUTZubBiuAJe1BQ",
      {
        contents: [{ parts: [{ text: enhancedPrompt }] }],
      },
      { headers: { "Content-Type": "application/json" } }
    );

    const aiResponse = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const jsonMatch = aiResponse?.match(/\[[\s\S]*\]/);
  
    if ("jsonMatch") {
      return JSON.parse(jsonMatch[0]);
    } else {
      throw new Error("Invalid AI response format");
    }
  } catch (error) {
    console.error("AI enhancement failed, using original data:", error);
    return originalData;
  }
};

// Generate a prompt for Gemini API
const generateAIPrompt = (originalData) => {
  return `
  As an expert survey designer, please clean and enhance the following survey data. 
    Follow these rules:
    1. Fix any malformed text or quotes
    
    2. Standardize question formatting
    3. Make answer options more clear and consistent
    4. Preserve all original Question_IDs and precode values
    5. Maintain the exact same data structure
    6. Keep all existing options but improve their text clarity
    7. Keep a question professional looking and make it in atleast 49 words
    8. Hispanic answer wer incomplete 
    No , not of Hispanic, Latino, or Spanish origin	1


    Original survey data:
    ${JSON.stringify(originalData, null, 2)}

    Please return the enhanced data in exactly the same JSON structure with the same fields (Question, Question_ID, Options array with answer and precode fields).
  `;
};

app.get("/val", async (req, res) => {
  try {
    const questionUsage = await ResearchSurveyQualification.findAll({
      attributes: [
        "question_id",
        [Sequelize.fn("COUNT", Sequelize.col("question_id")), "usage_count"],
        "survey_id",
      ],
      group: ["question_id"],
      order: [
        [Sequelize.fn("COUNT", Sequelize.col("question_id")), "DESC"],
        ["createdAt", "DESC"],
        ["updatedAt", "DESC"],
      ],
      limit: 10,
    });

    // Process each question usage data
    const arr = await Promise.all(
      questionUsage.map(async (item) => {
        const questionData = await UQualification.findAll({
          attributes: { exclude: ["id"] },
          where: {
            question_id: item.question_id,
            country_language: 9,
          },
        });

        // Function to process the fetched survey data
        const processedSurvey = (surveyData) => {
          return surveyData.reduce((acc, entry) => {
            const {
              question_id,
              question,
              type,
              answer,
              precode,
              country_language,
              country_language_code,
            } = entry;

            if (!acc[question_id]) {
              acc[question_id] = {
                Question: question,
                Question_ID: question_id,
                Type: type,
                country_language,
                country_language_code,
                Options: [],
              };
            }

            acc[question_id].Options.push({
              answer: answer.trim(),
              precode: precode.toString(),
            });

            return acc;
          }, {});
        };

        // Return processed survey data
        return Object.values(processedSurvey(questionData));
      })
    );

    // Flatten the array
    const flattenedArr = arr.flat();

    // Respond with the processed data
    res.status(200).json(flattenedArr);
  } catch (error) {
    console.error("Error fetching questions:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

const fs = require('fs'); 
const { SurveyQuota } = require("./models/hookSurveyModels");



app.post("/getResearchSurveys", async (req, res) => {
  try {
    const { loi_min, loi_max, country } = req.query;   
    const { score } = req.body;
    console.log(country)

    let arr = [];
    for (const key in score) {
      arr.push(Number(key)); 
    }
    const scoreList = arr.join(',');
    console.log(scoreList);

    // Create a condition for `bid_length_of_interview` dynamically
    const bidLengthCondition =
      loi_min || loi_max
        ? {
            bid_length_of_interview: {
              [Op.between]: [loi_min || 0, loi_max || 1000],
            },
          }
        : {};

    // Add country condition dynamically
    const countryCondition = country
      ? { country_language: { [Op.eq]: country } }
      : {};

    const surveys = await ResearchSurvey.findAll({
      where: {
        is_live: 1,
        message_reason: { [Op.ne]: "deactivated" },
        ...bidLengthCondition,
        ...countryCondition, 
      },
      attributes: [
        "survey_id",
        "earnings_per_click",
        "conversion",
        "livelink",
        "testlink",
        "bid_length_of_interview",
        "country_language"  // Changed from "country" to "country_language"
      ],
      include: [
        {
          model: ResearchSurveyQualification,
          as: "survey_qualifications",
          attributes: ["question_id", "precodes"],
          where: {
            question_id: {
              [Op.in]: arr, 
            },
          },
          required: false,
        },
      ],
      // limit: 1000,
      order: [
        ["earnings_per_click", "DESC"],
        ["conversion", "DESC"],
      ],
    });
    console.log(surveys);

    let result = [];
    for (const item of surveys) {
      let value = {};
      await associate(value, score, item.survey_qualifications, item.survey_id, item.earnings_per_click, item.livelink);
      if (Object.keys(value).length) result.push(value);
    }

    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/opiniomea/entry", surveyDetailController.redirectopiniomea)
app.get('/opiniomea/user', fetchAllSurveyStatuses);
app.get('/research-surveys', fetchAllResearchSurveys);
app.get('/supplies', fetchAllSupplies);
app.get("/user-profiles",fetchAllUserProfiles);  
app.post('/suppliers', createSupplier);
app.get('/userinfo', fetchSupplyInfo)
app.get("/opiniomea/survey", surveyDetailController.getSurveyOpiniomea)
app.get("/chanel/survey", surveyDetailController.getChanel)
app.get("/chanel/fc/survey", surveyDetailController.getFacebookChanel)
app.get("/getReport", reportingInfo.gettingReport)
app.post("/mail/user/", supplierData.UserInfo)
app.post("/demo/create", UserInfo.demoCreate)
app.get("/get/demo/prescreen/:id", UserInfo.prescreenAvailable)
app.get("/get/demo/survey/:id", UserInfo.getDemoSurvey)
app.post("/devicedata/", deviceDetail.getDeviceData);
app.get("/compaign/", surveyDetailController.redirectIndividual)
app.get("/compaign/live", surveyDetailController.redirectIndividualCompaign)
app.get("/0001012/", surveyDetailController.redirectUser)

app.use("/api/v1/survey", surveyRoutes);
app.use("/api/v2/survey", detailRoutes);
 
app.post('/call', Hook.createSurvey)
app.get("/:status", surveyDetailController.buyerData)
app.post("/supply/create", SupplyAuth.SupplierCreate);
app.post("/api/create", Auth.BuyerCreate);

module.exports = app;
                                     
