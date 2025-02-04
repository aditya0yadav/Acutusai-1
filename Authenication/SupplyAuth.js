const express = require("express");
const router = express.Router();
const { ResearchSurvey, ResearchSurveyQuota, ResearchSurveyQualification } = require("../models/uniqueSurvey");
const surveyDetailController = require("../controllers/Supplier/SupplierDetail");
const surveyGetController = require("../controllers/Supplier/SupplierGetSurvey");
const surveyPriceController = require("../controllers/Supplier/SupplierPriceCard");
const Supply = require("../models/supplyModels");

const SupplyAuthChecker = async (req, res, next) => {
    try {
        const ApiKey = req.headers["authorization"];
        if (!ApiKey) return res.status(401).json({ message: "Authorization header missing" });
        
        const SupplyData = await Supply.findOne({ where: { ApiKey } });
        console.log("finding the problem")
        if (!SupplyData) return res.status(401).json({ message: "Unauthenticated" });
        
        next();
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error", error: err.message });
    }
};

router.get("/price", surveyPriceController.createRateCard);
router.post("/prescreen/update/:AID", surveyDetailController.convertSurvey);
router.get("/:id", surveyDetailController.fetchSurvey);
router.get("/detail/:id", SupplyAuthChecker, surveyDetailController.getAllSurveysDetail);
router.get("/detaillive/:id", surveyDetailController.getDetail);
router.get("/", SupplyAuthChecker, surveyGetController.getLiveSurveys);
router.get("/finished", SupplyAuthChecker, surveyGetController.getFinishedSurveys);
router.post("/cookies/:id", surveyDetailController.CookiesDetail);
router.get("/redirect/:sid", surveyDetailController.redirectToSurvey);
router.get("/redirect/:sid/test", surveyDetailController.redirectToSurvey);
router.get("/link/:id", SupplyAuthChecker, surveyDetailController.getSurveyLink);
router.get("/quota/:id", SupplyAuthChecker, surveyDetailController.getSurveyQuota);
router.post("/service", SupplyAuthChecker, surveyDetailController.buyerData);
router.get("/qualification/:id", SupplyAuthChecker, surveyDetailController.getSurveyQualification);
router.get("/reporting/:id", surveyDetailController.detail);
router.get("/complete/:id", surveyDetailController.Complete);

module.exports = router;
