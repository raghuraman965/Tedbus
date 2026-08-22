// One-off: add Task 6 review i18n keys + missing search keys to all 6 catalogs.
const fs = require('fs');
const path = require('path');

const I18N_DIR = path.join(__dirname, '..', '..', 'src', 'assets', 'i18n');

const TRANSLATIONS = {
  en: {
    search: { tomorrow: 'Tomorrow', viewRoute: 'View Route', routeDetails: 'Route Details', stops: 'stops' },
    reviews: {
      count: 'reviews',
      write: 'Write a Review',
      formTitle: 'Rate your journey',
      editTitle: 'Edit your review',
      selectJourney: 'Select your completed journey',
      noCompletedJourneys: 'You can review a route after completing a journey on it.',
      checking: 'Checking eligibility…',
      yourRating: 'Your rating',
      titlePlaceholder: 'Give your review a title (optional)',
      commentPlaceholder: 'Share details of your own experience…',
      minChars: 'minimum {{min}} characters',
      submitBtn: 'Submit Review',
      updateBtn: 'Update Review',
      submitted: 'Review submitted. Thank you!',
      updated: 'Review updated.',
      deleted: 'Review deleted.',
      edited: '(edited)',
      edit: 'Edit',
      delete: 'Delete',
      report: 'Report',
      reportSubmit: 'Submit Report',
      reportedThanks: 'Thank you. Our team will look into this content.',
      alreadyReported: 'You have already reported this review.',
      anonymous: 'TedBus Traveller',
      verifiedBadge: 'Verified traveller',
      trustedBadge: 'Trusted reviewer',
      loginToVote: 'Log in to vote',
      empty: 'No reviews yet. Be the first to share your experience!',
      reportReasons: { spam: 'Spam or scam', abuse: 'Abusive content', fake: 'Fake review', harassment: 'Harassment', other: 'Other' },
      errors: {
        authRequired: 'Please log in to continue.',
        unverifiedAccount: 'Only verified accounts can post reviews.',
        bookingRequired: 'You need a booking on this route to review it.',
        bookingNotOwned: 'This booking does not belong to your account.',
        paymentNotVerified: 'Your payment for this journey is not verified yet.',
        journeyNotCompleted: 'You can review a route only after completing the journey.',
        routeMismatch: 'This booking does not match this route.',
        alreadyReviewed: 'You have already reviewed this journey.',
        editWindowExpired: 'Reviews can only be edited within 24 hours of posting.',
        generic: 'Something went wrong. Please try again.',
        loadFailed: 'Could not load reviews.'
      }
    }
  },
  hi: {
    search: { tomorrow: 'कल', viewRoute: 'मार्ग देखें', routeDetails: 'मार्ग विवरण', stops: 'स्टॉप' },
    reviews: {
      count: 'समीक्षाएँ',
      write: 'समीक्षा लिखें',
      formTitle: 'अपनी यात्रा को रेट करें',
      editTitle: 'अपनी समीक्षा संपादित करें',
      selectJourney: 'अपनी पूरी हुई यात्रा चुनें',
      noCompletedJourneys: 'इस मार्ग पर यात्रा पूरी होने के बाद ही समीक्षा कर सकते हैं।',
      checking: 'पात्रता जाँची जा रही है…',
      yourRating: 'आपकी रेटिंग',
      titlePlaceholder: 'समीक्षा को शीर्षक दें (वैकल्पिक)',
      commentPlaceholder: 'अपने अनुभव के बारे में बताएं…',
      minChars: 'न्यूनतम {{min}} वर्ण',
      submitBtn: 'समीक्षा भेजें',
      updateBtn: 'समीक्षा अपडेट करें',
      submitted: 'समीक्षा दर्ज की गई। धन्यवाद!',
      updated: 'समीक्षा अपडेट की गई।',
      deleted: 'समीक्षा हटा दी गई।',
      edited: '(संपादित)',
      edit: 'संपादित करें',
      delete: 'हटाएँ',
      report: 'रिपोर्ट करें',
      reportSubmit: 'रिपोर्ट भेजें',
      reportedThanks: 'धन्यवाद। हमारी टीम इस सामग्री की जाँच करेगी।',
      alreadyReported: 'आप पहले ही इस समीक्षा की रिपोर्ट कर चुके हैं।',
      anonymous: 'टेडबस यात्री',
      verifiedBadge: 'सत्यापित यात्री',
      trustedBadge: 'विश्वसनीय समीक्षक',
      loginToVote: 'वोट करने के लिए लॉग इन करें',
      empty: 'अभी कोई समीक्षा नहीं। अपना अनुभव साझा करने वाले पहले व्यक्ति बनें!',
      reportReasons: { spam: 'स्पैम या घोटाला', abuse: 'अपमानजनक सामग्री', fake: 'फर्जी समीक्षा', harassment: 'उत्पीड़न', other: 'अन्य' },
      errors: {
        authRequired: 'कृपया जारी रखने के लिए लॉग इन करें।',
        unverifiedAccount: 'केवल सत्यापित खाते ही समीक्षा पोस्ट कर सकते हैं।',
        bookingRequired: 'समीक्षा के लिए इस मार्ग पर आपकी बुकिंग होनी चाहिए।',
        bookingNotOwned: 'यह बुकिंग आपके खाते की नहीं है।',
        paymentNotVerified: 'इस यात्रा का भुगतान अभी तक सत्यापित नहीं हुआ है।',
        journeyNotCompleted: 'यात्रा पूरी होने के बाद ही समीक्षा कर सकते हैं।',
        routeMismatch: 'यह बुकिंग इस मार्ग से मेल नहीं खाती।',
        alreadyReviewed: 'आप पहले ही इस यात्रा की समीक्षा कर चुके हैं।',
        editWindowExpired: 'समीक्षा केवल 24 घंटों के भीतर संपादित की जा सकती है।',
        generic: 'कुछ गलत हो गया। कृपया पुनः प्रयास करें।',
        loadFailed: 'समीक्षाएँ लोड नहीं हो सकीं।'
      }
    }
  },
  ta: {
    search: { tomorrow: 'நாளை', viewRoute: 'வழியைப் பார்க்க', routeDetails: 'வழி விவரங்கள்', stops: 'நிறுத்தங்கள்' },
    reviews: {
      count: 'மதிப்பாய்வுகள்',
      write: 'மதிப்பாய்வு எழுதுங்கள்',
      formTitle: 'உங்கள் பயணத்தை மதிப்பிடுங்கள்',
      editTitle: 'உங்கள் மதிப்பாய்வைத் திருத்துங்கள்',
      selectJourney: 'முடிந்த பயணத்தைத் தேர்ந்தெடுங்கள்',
      noCompletedJourneys: 'இந்த வழியில் பயணம் முடிந்த பிறகே மதிப்பாய்வு செய்ய முடியும்.',
      checking: 'தகுதி சரிபார்க்கப்படுகிறது…',
      yourRating: 'உங்கள் மதிப்பீடு',
      titlePlaceholder: 'மதிப்பாய்வுக்கு தலைப்பு கொடுங்கள் (விருப்பம்)',
      commentPlaceholder: 'உங்கள் அனுபவத்தைப் பகிருங்கள்…',
      minChars: 'குறைந்தது {{min}} எழுத்துகள்',
      submitBtn: 'மதிப்பாய்வு சமர்ப்பிக்க',
      updateBtn: 'மதிப்பாய்வைப் புதுப்பிக்க',
      submitted: 'மதிப்பாய்வு சமர்ப்பிக்கப்பட்டது. நன்றி!',
      updated: 'மதிப்பாய்வு புதுப்பிக்கப்பட்டது.',
      deleted: 'மதிப்பாய்வு நீக்கப்பட்டது.',
      edited: '(திருத்தப்பட்டது)',
      edit: 'திருத்து',
      delete: 'நீக்கு',
      report: 'புகார்',
      reportSubmit: 'புகார் அனுப்பு',
      reportedThanks: 'நன்றி. எங்கள் குழு இதை ஆய்வு செய்யும்.',
      alreadyReported: 'நீங்கள் ஏற்கனவே இதைப் புகாரளித்துள்ளீர்கள்.',
      anonymous: 'டெட்பஸ் பயணி',
      verifiedBadge: 'சரிபார்க்கப்பட்ட பயணி',
      trustedBadge: 'நம்பகமான மதிப்பாய்வாளர்',
      loginToVote: 'வாக்களிக்க உள்நுழையுங்கள்',
      empty: 'இன்னும் மதிப்பாய்வுகள் இல்லை. உங்கள் அனுபவத்தைப் பகிர்ந்த முதல் நபராகுங்கள்!',
      reportReasons: { spam: 'ஸ்பேம் அல்லது மோசடி', abuse: 'துன்புறுத்தல் உள்ளடக்கம்', fake: 'போலி மதிப்பாய்வு', harassment: 'தொந்தரவு', other: 'மற்றவை' },
      errors: {
        authRequired: 'தொடர உள்நுழையுங்கள்.',
        unverifiedAccount: 'சரிபார்க்கப்பட்ட கணக்குகள் மட்டுமே மதிப்பாய்வு எழுத முடியும்.',
        bookingRequired: 'மதிப்பாய்வுக்கு இந்த வழியில் உங்கள் முன்பதிவு இருக்க வேண்டும்.',
        bookingNotOwned: 'இந்த முன்பதிவு உங்கள் கணக்கைச் சேர்ந்தது அல்ல.',
        paymentNotVerified: 'இந்தப் பயணத்திற்கான பணம் இன்னும் சரிபார்க்கப்படவில்லை.',
        journeyNotCompleted: 'பயணம் முடிந்த பிறகே மதிப்பாய்வு செய்ய முடியும்.',
        routeMismatch: 'இந்த முன்பதிவு இந்த வழியுடன் பொருந்தவில்லை.',
        alreadyReviewed: 'இந்தப் பயணத்தை ஏற்கனவே மதிப்பாய்வு செய்துள்ளீர்கள்.',
        editWindowExpired: 'மதிப்பாய்வுகளை 24 மணி நேரத்திற்குள் மட்டுமே திருத்த முடியும்.',
        generic: 'ஏதோ தவறு ஏற்பட்டது. மீண்டும் முயற்சிக்கவும்.',
        loadFailed: 'மதிப்பாய்வுகளை ஏற்ற முடியவில்லை.'
      }
    }
  },
  te: {
    search: { tomorrow: 'రేపు', viewRoute: 'మార్గాన్ని చూడండి', routeDetails: 'మార్గ వివరాలు', stops: 'స్టాప్‌లు' },
    reviews: {
      count: 'సమీక్షలు',
      write: 'సమీక్ష రాయండి',
      formTitle: 'మీ ప్రయాణాన్ని రేట్ చేయండి',
      editTitle: 'మీ సమీక్షను సవరించండి',
      selectJourney: 'పూర్తయిన ప్రయాణాన్ని ఎంచుకోండి',
      noCompletedJourneys: 'ఈ మార్గంలో ప్రయాణం పూర్తయిన తర్వాతే సమీక్ష రాయగలరు.',
      checking: 'అర్హత తనిఖీ అవుతోంది…',
      yourRating: 'మీ రేటింగ్',
      titlePlaceholder: 'సమీక్షకు శీర్షిక ఇవ్వండి (ఐచ్ఛికం)',
      commentPlaceholder: 'మీ అనుభవాన్ని పంచుకోండి…',
      minChars: 'కనీసం {{min}} అక్షరాలు',
      submitBtn: 'సమీక్ష సమర్పించండి',
      updateBtn: 'సమీక్షను నవీకరించండి',
      submitted: 'సమీక్ష సమర్పించబడింది. ధన్యవాదాలు!',
      updated: 'సమీక్ష నవీకరించబడింది.',
      deleted: 'సమీక్ష తొలగించబడింది.',
      edited: '(సవరించబడింది)',
      edit: 'సవరించు',
      delete: 'తొలగించు',
      report: 'నివేదించు',
      reportSubmit: 'నివేదిక పంపండి',
      reportedThanks: 'ధన్యవాదాలు. మా బృందం దీన్ని పరిశీలిస్తుంది.',
      alreadyReported: 'మీరు ఇప్పటికే ఇది నివేదించారు.',
      anonymous: 'టెడ్‌బస్ ప్రయాణికుడు',
      verifiedBadge: 'ధృవీకరించబడిన ప్రయాణికుడు',
      trustedBadge: 'నమ్మకమైన సమీక్షకుడు',
      loginToVote: 'ఓటు వేయడానికి లాగిన్ అవ్వండి',
      empty: 'ఇంకా సమీక్షలు లేవు. మీ అనుభవాన్ని పంచిన మొదటి వ్యక్తి అవ్వండి!',
      reportReasons: { spam: 'స్పామ్ లేదా మోసం', abuse: 'విధ్వంసక కంటెంట్', fake: 'నకిలీ సమీక్ష', harassment: 'వేధింపులు', other: 'ఇతర' },
      errors: {
        authRequired: 'కొనసాగించడానికి లాగిన్ అవ్వండి.',
        unverifiedAccount: 'ధృవీకరించబడిన ఖాతాలు మాత్రమే సమీక్షలు రాయగలవు.',
        bookingRequired: 'సమీక్షకు ఈ మార్గంలో మీ బుక్కింగ్ ఉండాలి.',
        bookingNotOwned: 'ఈ బుక్కింగ్ మీ ఖాతాది కాదు.',
        paymentNotVerified: 'ఈ ప్రయాణం కోసం మీ చెల్లింపు ఇంకా ధృవీకరించబడలేదు.',
        journeyNotCompleted: 'ప్రయాణం పూర్తయిన తర్వాతే సమీక్ష రాయగలరు.',
        routeMismatch: 'ఈ బుక్కింగ్ ఈ మార్గానికి సరిపోలడం లేదు.',
        alreadyReviewed: 'ఈ ప్రయాణాన్ని ఇప్పటికే సమీక్షించారు.',
        editWindowExpired: 'సమీక్షలను 24 గంటల్లోపు మాత్రమే సవరించగలరు.',
        generic: 'ఏదో తప్పు జరిగింది. దయచేసి మళ్లీ ప్రయత్నించండి.',
        loadFailed: 'సమీక్షలను లోడ్ చేయడం సాధ్యం కాలేదు.'
      }
    }
  },
  kn: {
    search: { tomorrow: 'ನಾಳೆ', viewRoute: 'ಮಾರ್ಗ ವೀಕ್ಷಿಸಿ', routeDetails: 'ಮಾರ್ಗ ವಿವರಗಳು', stops: 'ನಿಲುಗಡೆಗಳು' },
    reviews: {
      count: 'ವಿಮರ್ಶೆಗಳು',
      write: 'ವಿಮರ್ಶೆ ಬರೆಯಿರಿ',
      formTitle: 'ನಿಮ್ಮ ಪ್ರಯಾಣವನ್ನು ರೇಟ್ ಮಾಡಿ',
      editTitle: 'ನಿಮ್ಮ ವಿಮರ್ಶೆಯನ್ನು ಸಂಪಾದಿಸಿ',
      selectJourney: 'ಪೂರ್ಣಗೊಂಡ ಪ್ರಯಾಣವನ್ನು ಆಯ್ಕೆಮಾಡಿ',
      noCompletedJourneys: 'ಈ ಮಾರ್ಗದಲ್ಲಿ ಪ್ರಯಾಣ ಪೂರ್ಣಗೊಂಡ ನಂತರವೇ ವಿಮರ್ಶೆ ಬರೆಯಬಹುದು.',
      checking: 'ಅರ್ಹತೆ ಪರಿಶೀಲಿಸಲಾಗುತ್ತಿದೆ…',
      yourRating: 'ನಿಮ್ಮ ರೇಟಿಂಗ್',
      titlePlaceholder: 'ವಿಮರ್ಶೆಗೆ ಶೀರ್ಷಿಕೆ ನೀಡಿ (ಐಚ್ಛಿಕ)',
      commentPlaceholder: 'ನಿಮ್ಮ ಅನುಭವವನ್ನು ಹಂಚಿಕೊಳ್ಳಿ…',
      minChars: 'ಕನಿಷ್ಠ {{min}} ಅಕ್ಷರಗಳು',
      submitBtn: 'ವಿಮರ್ಶೆ ಸಲ್ಲಿಸಿ',
      updateBtn: 'ವಿಮರ್ಶೆ ನವೀಕರಿಸಿ',
      submitted: 'ವಿಮರ್ಶೆ ಸಲ್ಲಿಸಲಾಗಿದೆ. ಧನ್ಯವಾದಗಳು!',
      updated: 'ವಿಮರ್ಶೆ ನವೀಕರಿಸಲಾಗಿದೆ.',
      deleted: 'ವಿಮರ್ಶೆ ಅಳಿಸಲಾಗಿದೆ.',
      edited: '(ಸಂಪಾದಿಸಲಾಗಿದೆ)',
      edit: 'ಸಂಪಾದಿಸಿ',
      delete: 'ಅಳಿಸಿ',
      report: 'ವರದಿ',
      reportSubmit: 'ವರದಿ ಸಲ್ಲಿಸಿ',
      reportedThanks: 'ಧನ್ಯವಾದಗಳು. ನಮ್ಮ ತಂಡ ಇದನ್ನು ಪರಿಶೀಲಿಸುತ್ತದೆ.',
      alreadyReported: 'ನೀವು ಈಗಾಗಲೇ ಇದನ್ನು ವರದಿ ಮಾಡಿದ್ದೀರಿ.',
      anonymous: 'ಟೆಡ್‌ಬಸ್ ಪ್ರಯಾಣಿಕ',
      verifiedBadge: 'ಪರಿಶೀಲಿತ ಪ್ರಯಾಣಿಕ',
      trustedBadge: 'ವಿಶ್ವಾಸಾರ್ಹ ವಿಮರ್ಶಕ',
      loginToVote: 'ಮತದಾನಕ್ಕೆ ಲಾಗಿನ್ ಮಾಡಿ',
      empty: 'ಇನ್ನೂ ವಿಮರ್ಶೆಗಳಿಲ್ಲ. ನಿಮ್ಮ ಅನುಭವ ಹಂಚಿಕೊಂಡ ಮೊದಲಿಗರಾಗಿ!',
      reportReasons: { spam: 'ಸ್ಪ್ಯಾಮ್ ಅಥವಾ ವಂಚನೆ', abuse: 'ನಿಂದನಾತ್ಮಕ ವಿಷಯ', fake: 'ನಕಲಿ ವಿಮರ್ಶೆ', harassment: 'ಕಿರುಕುಳ', other: 'ಇತರೆ' },
      errors: {
        authRequired: 'ಮುಂದುವರಿಯಲು ಲಾಗಿನ್ ಮಾಡಿ.',
        unverifiedAccount: 'ಪರಿಶೀಲಿತ ಖಾತೆಗಳು ಮಾತ್ರ ವಿಮರ್ಶೆ ಬರೆಯಬಲ್ಲವು.',
        bookingRequired: 'ವಿಮರ್ಶೆಗೆ ಈ ಮಾರ್ಗದಲ್ಲಿ ನಿಮ್ಮ ಬುಕ್ಕಿಂಗ್ ಇರಬೇಕು.',
        bookingNotOwned: 'ಈ ಬುಕ್ಕಿಂಗ್ ನಿಮ್ಮ ಖಾತೆಯದ್ದಲ್ಲ.',
        paymentNotVerified: 'ಈ ಪ್ರಯಾಣಕ್ಕಾದ ಪಾವತಿ ಇನ್ನೂ ಪರಿಶೀಲಿಸಲಾಗಿಲ್ಲ.',
        journeyNotCompleted: 'ಪ್ರಯಾಣ ಪೂರ್ಣಗೊಂಡ ನಂತರವೇ ವಿಮರ್ಶೆ ಬರೆಯಬಹುದು.',
        routeMismatch: 'ಈ ಬುಕ್ಕಿಂಗ್ ಈ ಮಾರ್ಗಕ್ಕೆ ಹೊಂದಿಕೆಯಾಗುತ್ತಿಲ್ಲ.',
        alreadyReviewed: 'ಈ ಪ್ರಯಾಣವನ್ನು ಈಗಾಗಲೇ ವಿಮರ್ಶಿಸಿದ್ದೀರಿ.',
        editWindowExpired: 'ವಿಮರ್ಶೆಗಳನ್ನು 24 ಗಂಟೆಗಳ ಒಳಗೆ ಮಾತ್ರ ಸಂಪಾದಿಸಬಹುದು.',
        generic: 'ಏನೋ ತಪ್ಪಾಗಿದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
        loadFailed: 'ವಿಮರ್ಶೆಗಳನ್ನು ಲೋಡ್ ಮಾಡಲು ಸಾಧ್ಯವಾಗಿಲ್ಲ.'
      }
    }
  },
  ml: {
    search: { tomorrow: 'നാളെ', viewRoute: 'റൂട്ട് കാണുക', routeDetails: 'റൂട്ട് വിവരങ്ങൾ', stops: 'സ്റ്റോപ്പുകൾ' },
    reviews: {
      count: 'അവലോകനങ്ങൾ',
      write: 'അവലോകനം എഴുതുക',
      formTitle: 'നിങ്ങളുടെ യാത്ര റേറ്റ് ചെയ്യുക',
      editTitle: 'നിങ്ങളുടെ അവലോകനം എഡിറ്റ് ചെയ്യുക',
      selectJourney: 'പൂർത്തിയായ യാത്ര തിരഞ്ഞെടുക്കുക',
      noCompletedJourneys: 'ഈ റൂട്ടിൽ യാത്ര പൂർത്തിയായതിന് ശേഷം മാത്രമേ അവലോകനം എഴുതാൻ കഴിയൂ.',
      checking: 'യോഗ്യത പരിശോധിക്കുന്നു…',
      yourRating: 'നിങ്ങളുടെ റേറ്റിംഗ്',
      titlePlaceholder: 'അവലോകനത്തിന് തലക്കെട്ട് നൽകുക (ഓപ്ഷണൽ)',
      commentPlaceholder: 'നിങ്ങളുടെ അനുഭവം പങ്കിടുക…',
      minChars: 'കുറഞ്ഞത് {{min}} പ്രതീകങ്ങൾ',
      submitBtn: 'അവലോകനം സമർപ്പിക്കുക',
      updateBtn: 'അവലോകനം അപ്ഡേറ്റ് ചെയ്യുക',
      submitted: 'അവലോകനം സമർപ്പിച്ചു. നന്ദി!',
      updated: 'അവലോകനം അപ്ഡേറ്റ് ചെയ്തു.',
      deleted: 'അവലോകനം ഇല്ലാതാക്കി.',
      edited: '(എഡിറ്റ് ചെയ്തു)',
      edit: 'എഡിറ്റ്',
      delete: 'ഇല്ലാതാക്കുക',
      report: 'റിപ്പോർട്ട്',
      reportSubmit: 'റിപ്പോർട്ട് അയക്കുക',
      reportedThanks: 'നന്ദി. ഇത് ഞങ്ങളുടെ സംഘം പരിശോധിക്കും.',
      alreadyReported: 'നിങ്ങൾ ഇതിനകം ഇത് റിപ്പോർട്ട് ചെയ്തിട്ടുണ്ട്.',
      anonymous: 'ടെഡ്ബസ് യാത്രക്കാരൻ',
      verifiedBadge: 'സ്ഥിരീകരിച്ച യാത്രക്കാരൻ',
      trustedBadge: 'വിശ്വസ്ത അവലോകനക്കാരൻ',
      loginToVote: 'വോട്ട് ചെയ്യാൻ ലോഗിൻ ചെയ്യുക',
      empty: 'ഇതുവരെ അവലോകനങ്ങളില്ല. നിങ്ങളുടെ അനുഭവം പങ്കിടുന്ന ആദ്യ വ്യക്തിയാകൂ!',
      reportReasons: { spam: 'സ്പാം അല്ലെങ്കിൽ തട്ടിപ്പ്', abuse: 'അപകീർത്തികരമായ ഉള്ളടക്കം', fake: 'വ്യാജ അവലോകനം', harassment: 'ഉപദ്രവിക്കൽ', other: 'മറ്റുള്ളവ' },
      errors: {
        authRequired: 'തുടരാൻ ലോഗിൻ ചെയ്യുക.',
        unverifiedAccount: 'സ്ഥിരീകരിച്ച അക്കൗണ്ടുകൾക്ക് മാത്രമേ അവലോകനം എഴുതാൻ കഴിയൂ.',
        bookingRequired: 'അവലോകനത്തിന് ഈ റൂട്ടിൽ നിങ്ങളുടെ ബുക്കിംഗ് ഉണ്ടായിരിക്കണം.',
        bookingNotOwned: 'ഈ ബുക്കിംഗ് നിങ്ങളുടെ അക്കൗണ്ടിന്റേതല്ല.',
        paymentNotVerified: 'ഈ യാത്രയുടെ പണമടയ്ക്കൽ ഇതുവരെ സ്ഥിരീകരിച്ചിട്ടില്ല.',
        journeyNotCompleted: 'യാത്ര പൂർത്തിയായതിന് ശേഷം മാത്രമേ അവലോകനം എഴുതാൻ കഴിയൂ.',
        routeMismatch: 'ഈ ബുക്കിംഗ് ഈ റൂട്ടുമായി പൊരുത്തപ്പെടുന്നില്ല.',
        alreadyReviewed: 'ഈ യാത്ര ഇതിനകം അവലോകനം ചെയ്തിട്ടുണ്ട്.',
        editWindowExpired: 'അവലോകനങ്ങൾ 24 മണിക്കൂറിനുള്ളിൽ മാത്രമേ എഡിറ്റ് ചെയ്യാൻ കഴിയൂ.',
        generic: 'എന്തോ തെറ്റായി. വീണ്ടും ശ്രമിക്കുക.',
        loadFailed: 'അവലോകനങ്ങൾ ലോഡ് ചെയ്യാൻ കഴിഞ്ഞില്ല.'
      }
    }
  }
};

function deepMerge(target, source) {
  for (const key of Object.keys(source)) {
    const val = source[key];
    if (val && typeof val === 'object' && !Array.isArray(val)) {
      if (!target[key] || typeof target[key] !== 'object') target[key] = {};
      deepMerge(target[key], val);
    } else if (!(key in target)) {
      target[key] = val;
    }
  }
}

for (const [lang, patch] of Object.entries(TRANSLATIONS)) {
  const file = path.join(I18N_DIR, `${lang}.json`);
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  deepMerge(data, patch);
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
  console.log(`updated ${lang}.json`);
}
console.log('DONE');
