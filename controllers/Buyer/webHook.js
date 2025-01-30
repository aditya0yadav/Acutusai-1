const axios = require('axios');
const PQueue = require('p-queue').default;
const { ResearchSurvey, ResearchSurveyQuota, ResearchSurveyQualification } = require('../../models/uniqueSurvey');

// Configuration
const LUCID_API_CONFIG = {
    baseUrl: 'https://api.samplicio.us/Supply/v1/SupplierLinks',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'A8B96D8F-AB75-4C8C-B692-BE7AC2665BA7',
        'Accept': 'text/plain'
    }
};

/**
 * Fetches survey links from Lucid API
 * @param {string} surveyId - The survey identifier
 * @returns {Promise<{livelink: string|null, testlink: string|null}>}
 */
async function fetchLinksFromLucid(surveyId) {
    const postUrl = `${LUCID_API_CONFIG.baseUrl}/Create/${surveyId}/6588`;
    const params = {
        SupplierLinkTypeCode: 'OWS',
        TrackingTypeCode: 'NONE'
    };

    try {
        console.log('Attempting POST request to Lucid API...');
        const { data, status } = await axios.post(postUrl, params, { 
            headers: LUCID_API_CONFIG.headers 
        });

        if (status === 200 && data.SupplierLink) {
            const { LiveLink, TestLink, DefaultLink } = data.SupplierLink;
            return {
                livelink: DefaultLink === null ? LiveLink : null,
                testlink: TestLink || null
            };
        }

        console.error('POST request did not return valid SupplierLink data');
        return { livelink: null, testlink: null };
    } catch (error) {
        console.error('Error fetching links from Lucid:', error.message);
        return { livelink: null, testlink: null };
    }
}

// Initialize queue with concurrency limit
const surveyQueue = new PQueue({ concurrency: 20 });

/**
 * Processes a single survey
 * @param {Object} surveyData - The survey data to process
 * @returns {Promise<Object|null>} - Processed survey or null
 */
async function processSurvey(surveyData) {
    const {
        survey_id,
        survey_name,
        account_name,
        country_language,
        industry,
        study_type,
        bid_length_of_interview,
        bid_incidence,
        collects_pii,
        survey_group_ids,
        is_live,
        survey_quota_calc_type,
        is_only_supplier_in_group,
        cpi,
        total_client_entrants,
        total_remaining,
        completion_percentage,
        conversion,
        overall_completes,
        mobile_conversion,
        earnings_per_click,
        length_of_interview,
        termination_length_of_interview,
        respondent_pids,
        message_reason,
        revenue_per_interview,
        survey_quotas,
        survey_qualifications
    } = surveyData;

    let existingSurvey = await ResearchSurvey.findOne({ 
        where: { survey_id } 
    });

    // Handle survey status changes
    if (existingSurvey) {
        if (['reactivated', 'deactivated'].includes(message_reason)) {
            return await existingSurvey.update({ message_reason });
        }

        if (message_reason === 'updated') {
            return await updateExistingSurvey(
                existingSurvey,
                surveyData,
                survey_quotas,
                survey_qualifications
            );
        }
    }

    // Handle new survey creation
    if (!existingSurvey && message_reason === 'new') {
        const links = await fetchLinksFromLucid(survey_id);
        if (!links?.livelink || links.livelink === 'Not') {
            console.log(`Skipping survey_id ${survey_id} due to null or invalid livelink`);
            return null;
        }

        return await createNewSurvey(surveyData, links);
    }

    console.log('No action taken for survey_id:', survey_id);
    return null;
}

/**
 * Updates an existing survey with new data
 * @param {Object} existingSurvey - The existing survey record
 * @param {Object} surveyData - New survey data
 * @param {Array} quotas - Survey quotas
 * @param {Array} qualifications - Survey qualifications
 * @returns {Promise<Object>} - Updated survey
 */
async function updateExistingSurvey(existingSurvey, surveyData, quotas, qualifications) {
    const updatedSurvey = await existingSurvey.update({
        ...surveyData,
        survey_quotas: undefined,
        survey_qualifications: undefined
    });

    if (quotas) {
        await ResearchSurveyQuota.destroy({ 
            where: { survey_id: surveyData.survey_id } 
        });
        await Promise.all(quotas.map(quota => 
            ResearchSurveyQuota.create({ 
                ...quota, 
                survey_id: surveyData.survey_id 
            })
        ));
    }

    if (qualifications) {
        await ResearchSurveyQualification.destroy({ 
            where: { survey_id: surveyData.survey_id } 
        });
        await Promise.all(qualifications.map(qualification => 
            ResearchSurveyQualification.create({ 
                ...qualification, 
                survey_id: surveyData.survey_id 
            })
        ));
    }

    return updatedSurvey;
}

/**
 * Creates a new survey record
 * @param {Object} surveyData - Survey data
 * @param {Object} links - Survey links
 * @returns {Promise<Object>} - New survey
 */
async function createNewSurvey(surveyData, links) {
    const newSurvey = await ResearchSurvey.create({
        ...surveyData,
        survey_quotas: undefined,
        survey_qualifications: undefined,
        livelink: links.livelink,
        testlink: links.testlink
    });

    if (surveyData.survey_quotas) {
        await Promise.all(surveyData.survey_quotas.map(quota =>
            ResearchSurveyQuota.create({
                ...quota,
                survey_id: newSurvey.survey_id
            })
        ));
    }

    if (surveyData.survey_qualifications) {
        await Promise.all(surveyData.survey_qualifications.map(qualification =>
            ResearchSurveyQualification.create({
                ...qualification,
                survey_id: newSurvey.survey_id
            })
        ));
    }

    return newSurvey;
}

/**
 * Express route handler for survey creation
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createSurvey(req, res) {
    try {
        const surveys = req.body;
        const results = await Promise.all(
            surveys.map(survey => surveyQueue.add(() => processSurvey(survey)))
        );

        res.status(201).json({
            message: 'Surveys processed successfully',
            surveys: results.filter(Boolean)
        });
    } catch (error) {
        console.error('Error processing surveys:', error);
        res.status(500).json({ 
            message: 'Error processing surveys', 
            error: error.message 
        });
    }
}

module.exports = { createSurvey };
