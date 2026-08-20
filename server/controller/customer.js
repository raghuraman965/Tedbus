const Customer = require('../models/customer');
const { signToken } = require('../middleware/auth');
const { tReq } = require('../services/i18n');

exports.addnewcustomer = async (req, res) => {
    try {
        const { name, email, googleId, profilepicture, profilePicture, sub, picture } = req.body;
        const safeGoogleId = googleId || sub || null;
        const safePicture = profilePicture || profilepicture || picture || null;

        let exisitingcustomer = await Customer.findOne({ email: email }).lean().exec();
        if (exisitingcustomer) {
            const updates = {};
            if (safeGoogleId && !exisitingcustomer.googleId) updates.googleId = safeGoogleId;
            if (safePicture && !exisitingcustomer.profilePicture) updates.profilePicture = safePicture;
            if (Object.keys(updates).length) {
                await Customer.updateOne({ _id: exisitingcustomer._id }, { $set: updates });
                exisitingcustomer = { ...exisitingcustomer, ...updates };
            }
            return res.status(200).json({ ...exisitingcustomer, token: signToken(exisitingcustomer) });
        }

        const customer = new Customer({
            name,
            email,
            googleId: safeGoogleId,
            profilePicture: safePicture,
            authProvider: "google",
        });
        const newCustomer = await customer.save();
        res.status(201).json({ ...newCustomer.toObject(), token: signToken(newCustomer) });
    } catch (error) {
        console.error('error adding customer', error);
        res.status(500).json({ error: tReq(req, "errors.auth.internal") });
    }
}
