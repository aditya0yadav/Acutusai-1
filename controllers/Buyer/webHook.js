const axios = require('axios');
const PQueue = require('p-queue').default;
const { Survey, SurveyQuota, SurveyQualification } = require('../../models/hookSurveyModels');
const { ResearchSurvey, ResearchSurveyQuota, ResearchSurveyQualification } = require('../../models/uniqueSurvey');

async function fetchLinksFromLucid(survey_id) {
    const postUrl = `https://api.samplicio.us/Supply/v1/SupplierLinks/Create/${survey_id}/6588`;
    const params = { 'SupplierLinkTypeCode': 'OWS', 'TrackingTypeCode': 'NONE' };
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'A8B96D8F-AB75-4C8C-B692-BE7AC2665BA7',
        'Accept': 'text/plain',
    };

    try {
        console.log('Attempting POST request...');
        const postResponse = await axios.post(postUrl, params, { headers });

        if (postResponse.status === 200 && postResponse.data.SupplierLink) {
            const { LiveLink, TestLink, DefaultLink } = postResponse.data.SupplierLink;
            return {
                livelink: DefaultLink === null ? "Not" : LiveLink || null,
                testlink: TestLink || null,
            };
        }

        console.error('POST request did not return valid SupplierLink data.');
        return { livelink: null, testlink: null };

    } catch (error) {
        console.error('Error fetching links from Lucid:', error.message);
        return { livelink: null, testlink: null };
    }
}

const surveyQueue = new PQueue({ concurrency: 20 });

// Function to process a single survey
const processSurvey = async (survey_id, revenue_per_interview) => {
    try {
        console.log(`Processing survey_id: ${survey_id}`);
        console.log('Received revenue_per_interview:', revenue_per_interview);
        console.log('Type of revenue_per_interview:', typeof revenue_per_interview);

        // Ensure revenue_per_interview is a valid number
        if (typeof revenue_per_interview === 'string') {
            try {
                revenue_per_interview = JSON.parse(revenue_per_interview);
            } catch (error) {
                console.error(`Error parsing revenue_per_interview for survey_id ${survey_id}:`, error);
                return;
            }
        }
        
        if (typeof revenue_per_interview !== 'number' || isNaN(revenue_per_interview)) {
            console.error(`Invalid revenue_per_interview for survey_id ${survey_id}:`, revenue_per_interview);
            return;
        }

        await sequelize.transaction(async (t) => {
            console.log(`Starting transaction for survey_id: ${survey_id}`);
            const quotas = await Quota.findAll({ where: { SurveyID: survey_id }, transaction: t });
            
            if (!quotas.length) {
                console.warn(`No quotas found for survey_id: ${survey_id}`);
                return;
            }
            
            let totalTargetN = quotas.reduce((sum, quota) => sum + quota.TargetN, 0);
            console.log(`Total TargetN for survey_id ${survey_id}:`, totalTargetN);
            
            for (const quota of quotas) {
                let proportion = quota.TargetN / totalTargetN;
                let calculated_cpi = revenue_per_interview * proportion;
                console.log(`Updating quota ${quota.id} with calculated_cpi:`, calculated_cpi);
                
                await quota.update({ CPI: calculated_cpi }, { transaction: t });
            }
            console.log(`Successfully updated quotas for survey_id: ${survey_id}`);
        });
    } catch (error) {
        console.error(`Error processing survey_id ${survey_id}:`, error);
    }
};


// Main createSurvey handler
async function createSurvey(req, res) {
    try {
        const surveys = req.body;
        // console.log(`Received ${surveys.length} surveys for processing.`);

        // Add all surveys to the queue
        const results = await Promise.all(surveys.map(survey => surveyQueue.add(() => processSurvey(survey))));

        res.status(201).json({
            message: 'Surveys processed successfully',
            surveys: results.filter(result => result !== null),
        });
    } catch (error) {
        console.error('Error processing surveys:', error);
        res.status(500).json({ message: 'Error processing surveys', error: error.message });
    }
}

module.exports = { createSurvey };
