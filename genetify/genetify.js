var genetifyTime = {
    'begin': {},
    'end': {},
    'time': {}
};

genetifyTime.begin.load = new Date().getTime();

if (!window.console || !window.console.firebug){
    console = {
        warn   : function(){},
        error  : function(){},
        info   : function(){},
        trace  : function(){},
        log    : function(){},
        assert : function(){}
    };
}

var genetify = {

    config: {
        REQUEST_RESULTS: true,
        USE_RESULTS_CACHE: true,
        REMOTE_BASE_URL: window.location.protocol + '//app.genetify.com',
        USE_URCHIN: false,
        USE_COOKIE: true,
        NO_VARYING: false,
        LOAD_CONTROLS: false,
        NAMESPACE: window.location.pathname
        //TODO: NO_SCANNING
    },

    genome: {},
    genomeOverride: {},
    results: {},
    re: {},
    referrer: {},
    pageview_xid: 0,

    _cssRulesCache: [],
    _cssSheetCount: 0,
    _systemObjects: [],
    _systemNames: {},
    _scanCounter: 0,

    init: function(){

        //TODO: optimize safari load, safari init, IE init, IE vary

        //TODO:
        // if (el.addEventListener){
        //   el.addEventListener('click', modifyText, false);
        // } else if (el.attachEvent){
        //   el.attachEvent('onclick', modifyText);
        // }

        window.onerror = genetify.record.error;

        //TODO: is onmousedown really the best solution?
        // special error for A tag and onclick
        window.onclick = function(e){
            var _event = e || window.event;
            var target = _event.target || _event.srcElement;
            var onclickBody = target.getAttribute('onclick');
            if (target.href && onclickBody && onclickBody.indexOf('genetify.record.goal') != -1){
                var message = 'Don\'t record clicking a link with the "onclick" event. Use "onmousedown" instead.';
                console.assert(false, message);
                // because error is suppressed when event
                genetify.record.error(message);
            }
        };

        if (window.location.protocol.indexOf('file:') != -1){
            genetify.config.REMOTE_BASE_URL = genetify.config.REMOTE_BASE_URL.replace('file:', 'http:');
        }

        if (genetify.config.LOAD_CONTROLS){
            window.onload = function(){
                genetify.controls.load();
            };
        }

        genetify._checkQueryString(); //because of links from GA

        genetify.cookie.init();

        var URLData = window.location.hash.slice(1);
        genetify.utils.update(genetify.genomeOverride, genetify.utils.fragmentToGenome(URLData));

        if (!genetify.config.NO_VARYING){
            if (genetify.config.REQUEST_RESULTS){
                genetify.requestResults('genetify.handleResults');
            }

            // TODO: make this optional as speed optimization
            genetify._checkCSS(['.v', '.genetify_enabled', '.genetify_disabled']);
            //TODO: parse only CSS after init()
            //TODO: return objects instead of setting
            genetify._registerSystemObjects();
            genetify._createRegexes();
            genetify._setReferrer();
        }

    },

    handleResults: function(JSON){
        //TODO: validate JSON
        genetify.results = eval(JSON);
        genetifyTime.end.results = new Date().getTime();

        var elem = document.getElementById('genetify_results_table');
        if (elem){
            genetify.controls.showResults();
        }

    },
	
    _registerSystemObjects: function(){
        for (var p in window){
            genetify._systemObjects.push(window[p]);
            genetify._systemNames[p] = true;
        }
        genetify._systemObjects['genetify'] = genetify;
        genetify._systemNames['genetify'] = true;
    },

    _setReferrer: function(){
        if (!document.referrer) return;

        var URLObj = genetify.utils.parseURL(document.referrer);
        genetify.referrer = {
            'domain': URLObj['host'],
            'path': URLObj['pathname'],
            'external': (document.domain == URLObj['host']) ? false : true
        };

        //TODO: improve list?
        var searchEngineQueryParam = {
            'snipshot': 'p', 'google': 'q', 'yahoo': 'p', 'msn': 'q', 'aol': 'query', 'lycos': 'query', 'askjeeves': 'q', 'ask': 'q', 'altavista': 'q', 'netscape': 'query', 'cnn': 'query', 'looksmart': 'qt', 'about': 'terms', 'mamma': 'query', 'alltheweb': 'q', 'gigablast': 'q', 'voila': 'rdata', 'virgilio': 'qs', 'live': 'q', 'baidu': 'wd', 'alice': 'qs', 'yandex': 'text', 'najdi': 'q', 'club-internet': 'q', 'mama': 'query', 'seznam': 'q', 'search': 'q', 'szukaj': 'szukaj', 'szukaj': 'qt', 'netsprint': 'q', 'google.interia': 'q', 'szukacz': 'q', 'yam': 'k', 'pchome': 'q'
        };
        for (var p in searchEngineQueryParam){
            if (genetify.referrer.domain.indexOf(p) != -1){
                genetify.utils.assert(searchEngineQueryParam[p], 'Referral from search engine "' + p + '" does not contain a query term');
                genetify.referrer.searchTerm = URLObj['params'][searchEngineQueryParam[p]];
                genetify.referrer.searchEngine = p;
                break;
            }
        }
    },

    _checkQueryString: function(){
        var re = /&?genome=\((.*)\)/;
        var queryStringData = re.exec(window.location.search);
        if (queryStringData && queryStringData[1]){
            window.location.href = window.location.href.replace(re, '') + '#' + queryStringData[1];
        }
    },

    _checkCSS: function(requiredCSS){
        var checked = [];
        genetify._forAllCSSRules(function(cssRule){
            for (var i=0; i < requiredCSS.length; i++){
                if (cssRule.selectorText == requiredCSS[i]){
                    //TODO: is this needed? slowing loop?
                    genetify.utils.assert(
                        checked[i] != 1,
                        'CSS rule ' + requiredCSS[i] + ' is declared more than once'
                    );
                    checked[i] = 1;
                }
            }
        });
        genetify.utils.assert(
            genetify.utils.sum(checked) == requiredCSS.length,
            'Missing required CSS rules'
        );
    },

    _createRegexes: function(){
        /*TODO deal with multi selector rules, multi class rules
            #asdf, #zxcv{}
            #asdf.someclass.vA
        */
        //TODO: only get rightmost .v but also handle IE reordering (.vA#asdf)

        //TODO: i'm thinking of changing the rules so that both
        // .myclass.myclass2.vA and .myclass2.vA
        // would be considered part of gene "myclass2"
        // so then you could create your compound rules
        // .myclass could modify the behavior of .myclass2.vA

        var geneNamePattern = '(.*)';
        var markerPatternDict = {
            'additiveCSSRules': '[a-zA-Z0-9_$]\\.v',
            'CSSRules': '_v',
            'javascript': '_v',
            'elements': '\\s+v\\s+'
        };
        var variantNamePattern = '([A-Z0-9_$][a-zA-Z0-9_$]*)';
        for (var p in markerPatternDict){
            var pattern = geneNamePattern + markerPatternDict[p] + variantNamePattern;
            if (p == 'elements'){
                genetify.re[p] = new RegExp(pattern, 'i');
            }
            else {
                genetify.re[p] = new RegExp(pattern);
            }
        }

        //TODO: better way to pass info than as genetify.re prop?
        var classPattern = '\s?v' + variantNamePattern;
        genetify.re.additiveCSSRulesReplacer = new RegExp(classPattern);
        genetify.re.elementsMarker = new RegExp(markerPatternDict.elements);

        // TODO: is compiling any faster? does it do anything?
        // for (var p in genetify.re){
        //     genetify.re[p] = genetify.re[p].compile(genetify.re[p].source);
        // }
    },

    requestResults: function(callback, pageLoaded /*optional*/){
        genetifyTime.begin.results = new Date().getTime();

        var src = '';
        if (!pageLoaded && genetify.config.USE_RESULTS_CACHE){
            //TODO: find a better naming convention?
            var filenameParts = [
                document.domain,
                // double encode because remote filename is decoded once
                encodeURIComponent(encodeURIComponent(genetify.config.NAMESPACE)),
                'results.js'
            ];

            var delim = '__';
            genetify.utils.assert(genetify.config.NAMESPACE.indexOf(delim) == -1,
                'Namespace contains delimiter: ' + delim
            );
            src = genetify.config.REMOTE_BASE_URL + '/cache/' + filenameParts.join(delim);
        }
        else {
            // to override default callback
            var queryDict = {
                'callback':  callback
            };
            src = genetify.utils.buildURL('/content/gen.reader.json', queryDict);
        }

        //TODO: is document.write really much better?
        if (pageLoaded){
            genetify.utils.insertScript(src);
        }
        else {
            document.write('<script type="text/javascript" src="' + src + '"></script>');
        }
    },

    vary: function(geneTypes){
        genetifyTime.begin.vary = new Date().getTime();
		
        //TODO: should cookie overriding preserve original pageview_xid?
        // set to zero to overwrite any previous pageview_xid
        genetify.pageview_xid = 0;

        genetify.utils.assert(
            typeof(GENETIFY_CONFIG) == 'undefined',
            'GENETIFY_CONFIG must be set before genetify.js is loaded.'
        );


        genetify.utils.assert(!genetify.config.NO_VARYING, 'NO_VARYING is set to true');
        //TODO: order of functions?
        var validTypes = ['elements', 'CSSRules', 'additiveCSSRules', 'javascript'];
        var myArgs = []; //because Safari doesn't allow assignment
        if (!arguments.length || arguments[0] == 'all'){
            myArgs = validTypes;
        }
        else {
            myArgs = genetify.vary.arguments;
        }

        for (var i=0; i < myArgs.length; i++){		
            //TODO: this won't catch all bad arguments
            genetify.utils.assert(
                validTypes.join('|').indexOf(myArgs[i]) != -1,
                myArgs[i] + ': not a valid type for varying'
            );
            if (myArgs[i] == 'CSSRules'){
                genetify.switchRules(genetify.getRules());
            }
            else if (myArgs[i] == 'elements'){
                genetify.switchElements(genetify.getElements());
            }
            else if (myArgs[i] == 'additiveCSSRules'){
                genetify.switchAdditiveRules(genetify.getAdditiveRules());
            }
            else if (myArgs[i] == 'javascript'){
                genetify.getAndSwitchObjects();
            }
        }

        genetify.pageview_xid = genetify._generateID();
        // TODO: if not USE_COOKIE?

        genetify.cookie.save(genetify.genome, genetify.config.NAMESPACE);

        genetifyTime.end.vary = new Date().getTime();
        genetify.record.pageview(genetify.genome, genetify.referrer, geneTypes);

        return genetify.genome;
    },

    _generateID: function(){
        // TODO: is this number big enough to avoid random collisions?
        var max = Math.pow(10, 15);
        var id = Math.round(Math.random() * max);
        //TODO: make it work with mySQLMaxInt
        // var mySQLMaxInt = 9223372036854775806;
        return id;
    },

    _lowerTagNames: function(selector){
        // because IE capitalizes elements tags in selectors
        //TODO: what other CSS case sensitivity quirks?
        var lowerTagInToken = function(token){
            var splitter = '';
            if (token.indexOf('#') > -1) {
                // Token is an ID selector
                splitter = '#';
            }
            else if (token.indexOf('.') > -1) {
                // Token contains a class selector
                splitter = '.';
            }
            else {
                // token is JUST an element (not a class or ID selector)
                return token.toLowerCase();
            }
            var bits = token.split(splitter);
            var lowered = [bits[0].toLowerCase(), bits.slice(1).join(splitter)];
            return lowered.join(splitter);
        };

        var tokens = selector.split(' ');
        for (var i = 0; i < tokens.length; i++) {
            var token = tokens[i].replace(/^\s+/,'').replace(/\s+$/,'');
            tokens[i] = lowerTagInToken(token);
        }
        return tokens.join(' ');
    },

    getRules: function(){
        var CSSRuleDict = {};
        genetify._forAllCSSRules(function(cssRule){
            CSSRuleDict[cssRule.selectorText] = cssRule.style.cssText;
        });
        //TODO: what happens when multiple identical selectors... correct override behavior?
        var geneDict = genetify._groupVariantsByGeneName(CSSRuleDict, genetify.re.CSSRules, function(matches){
            var geneName = matches[1];
            if (geneName != geneName.toLowerCase()){
                geneName = genetify._lowerTagNames(geneName);
            }
            return [geneName, matches[2]];
        });
        return geneDict;
    },

    getAdditiveRules: function(){
        var CSSRuleDict = {};
        genetify._forAllCSSRules(function(cssRule){
            CSSRuleDict[cssRule.selectorText] = cssRule.selectorText;
        });
        //TODO: what happens when multiple identical selectors... correct override behavior?
        var geneDict = genetify._groupVariantsByGeneName(CSSRuleDict, genetify.re.additiveCSSRules, function(matches){
            var variantName = matches[2];
            var geneName = matches[0].replace('.v' + variantName, ''); //because IE changes className position in selector
            if (geneName != geneName.toLowerCase()){
                geneName = genetify._lowerTagNames(geneName);
            }
            return [geneName, variantName];
        });
        // change geneDict values to class name to-be-added... kinda ugly
        for (var p in geneDict){
            for (var i=0; i < geneDict[p].length; i++){
                var matches = genetify.re.additiveCSSRules.exec(geneDict[p][i]);
                geneDict[p][i] = [matches[2], 'v' + matches[2]];
            }
        }
        return geneDict;
    },

    getElements: function(){
        var genetified = genetify.utils.getElementsByClassName('v');
        var elemDict = genetify._groupElementsByClassName(genetified);
        var geneDict = genetify._groupVariantsByGeneName(elemDict, genetify.re.elements);
        return geneDict;
    },

    _groupElementsByClassName: function(elements){
        var elemDict = {};
        for (var i=0; i < elements.length; i++){
            var matches = genetify.re.elements.exec(elements[i].className);
            if (matches){
                var name = matches[0];
                if (!elemDict[name]){
                    elemDict[name] = [];
                }
                elemDict[name].push(elements[i]);
            }
        }
        return elemDict;
    },

    _getUserDict: function(){
        //TODO: proper test for IE or no-global-namespace-iteration
        if (document.scripts && document.all){
            return genetify.scanJS.getUserDict();
        }
        else {
            var userDict = {};
            //TODO: optimizize
            for (var p in window){
                if (!genetify._systemNames[p]){
                    userDict[p] = window[p];
                }
            }
            return userDict;
        }
    },

    _getRandomVariant: function(variants){
        var randomI = Math.floor(Math.random() * variants.length);
        return variants[randomI];
    },

    _getVariantWithProbability: function(variants, probs){
        var randomProb = Math.random() * genetify.utils.sum(probs); //because sum != 1 exactly
        var threshold = 0;
        for (var i=0; i < variants.length; i++){
            threshold += probs.shift();
            if (randomProb <= threshold){
                return variants[i];
            }
        }
        return genetify.utils.assert(false, 'No variant selected');
    },

    // TODO: rename fitnesses?
    _getProbabilities: function(geneResults, variants){
        var probs = [];
        var newProbs = [];
        for (var i=0; i < variants.length; i++){
            var variantName = variants[i][0];
            if (geneResults[variantName] && geneResults[variantName]['weight']){
                probs[i] = geneResults[variantName]['weight'];
                geneResults[variantName]['found'] = true;
            }
            else {
                probs[i] = NaN;
                newProbs.push(1 / variants.length);
            }
        }
        if (newProbs.length){
            probs = genetify._adjustProbs(probs, newProbs);
        }

        probs = genetify._allocateUnused(geneResults, probs);

        var sum = genetify.utils.round(genetify.utils.sum(probs));
        genetify.utils.assert(sum == 1, 'Weights add up to ' + sum + ' for ' + geneResults['name']);
        return probs;
    },

    // TODO: figure out a truly rational way of adjusting!!!
    // one that makes sense with the server's way
    _adjustProbs: function(probs, newProbs){
        for (var k=0; k < probs.length; k++){
            probs[k] *= 1 - genetify.utils.sum(newProbs);
        }
        for (var h=0; h < probs.length; h++){
            if (!probs[h]){
                probs[h] = newProbs.shift();
            }
        }
        return probs;
    },

    _allocateUnused: function(geneResults, probs){
        var missingProbs = [];
        for (var p in geneResults){
            if (geneResults[p]['weight'] && !geneResults[p]['found']){
                missingProbs.push(geneResults[p]['weight']);
            }
        }
        if (missingProbs.length){
            for (var k=0; k < probs.length; k++){
                //TODO: find better formula for adjusting
                probs[k] += genetify.utils.sum(missingProbs) / probs.length;
            }
        }
        return probs;
    },

    _getFixedVariant: function(geneName, variants){
        for (var i=0; i < variants.length; i++){
            if (genetify.genomeOverride[geneName] == variants[i][0]){
                return variants[i];
            }
        }
        return genetify.utils.assert(
            false,
            'No variant of name ' + genetify.genomeOverride[geneName] + ' in gene ' + geneName
        );
    },

    _selectVariant: function(geneName, original, variants){
        genetify.utils.assert(
            !genetify.genome[geneName],
            'Name conflict: ' + geneName
        );
        genetify.utils.assert(
            typeof(original) != 'undefined',
            'No original for gene: ' + geneName
        );
        var selectedVariant = null;
        variants.push(['__original__', original]);
        if (genetify.genomeOverride[geneName]){
            selectedVariant = genetify._getFixedVariant(geneName, variants);
        }
        else if (!genetify.utils.empty(genetify.results[geneName])){
            var probs = genetify._getProbabilities(genetify.results[geneName], variants);
            selectedVariant = genetify._getVariantWithProbability(variants, probs);
        }
        else {
            selectedVariant = genetify._getRandomVariant(variants);
        }
        genetify.genome[geneName] = selectedVariant[0];
        return selectedVariant;
    },

    //TODO: handle "access to restricted URI"
    _walkObject: function(rootObj, func){
        // IMPORTANT: rootObj should be prefiltered for bad objects
        var self = genetify; //use local name for speed
        self._scanCounter += 1; // to allow repeated calls to genetify.vary
        //TODO: limit scan depth as config option

        var objStack = [rootObj];
        while (objStack.length){

            var currentObj = objStack.pop();
            func(currentObj);

            for (var p in currentObj){
                //check for nested objects
                //TODO: can functions have nested objects?
                if (typeof(currentObj[p]) == 'object'){

                    // run away from weird false objects
                    //TODO: find less crude workaround
                    if (!currentObj[p]) break;

                    // check if visited on current walk of namespace
                    if (!currentObj[p].visited || currentObj[p].visited != self._scanCounter){

                        try {
                            // mark to avoid circular references
                            currentObj[p].visited = self._scanCounter;
                        }
                        catch(err){
                            // read-only objects are no good
                            continue;
                        }

                        // for Firefox
                        //TODO: when is necessary??
                        if (self._systemObjects.indexOf && self._systemObjects.indexOf(currentObj[p]) != -1){
                            continue;
                        }

                        objStack.push(currentObj[p]);
                    }
                }
            }

        }
    },

    _getAndSwitchObject: function(obj){
        var geneDict = genetify._groupVariantsByGeneName(obj, genetify.re.javascript);
        for (var g in geneDict){

            // because top level scan doesn't pass in window object
            var global = false;
            if (window[g] === obj[g]){
                global = true;
            }

            var selectedVariant = genetify._selectVariant(g, obj[g], geneDict[g]);
            //TODO: original code is lost forever when overwritten... bad
            obj[g] = selectedVariant[1];

            if (global){
                window[g] = selectedVariant[1];
            }
        }
    },

    getAndSwitchObjects: function(){
        return genetify._walkObject(genetify._getUserDict(), genetify._getAndSwitchObject);
    },

    switchRules: function(geneDict){
        genetify._forAllCSSRules(function(cssRule){
            for (var g in geneDict){
                //TODO: this only works if original is present in CSS rules... make more forgiving?
                if (g == cssRule.selectorText){
                    var selectedVariant = genetify._selectVariant(g, cssRule.style.cssText, geneDict[g]);
                    cssRule.style.cssText = selectedVariant[1];
                    //TODO: original code is lost forever when overwritten... bad
                }
            }
        });
    },

    switchElements: function(geneDict){
        for (var g in geneDict){
            //TODO: does order of originals correspond to order of variants?
            var completeSet = genetify.utils.getElementsByClassName(g);
            var originals = [];
            for (var i=0; i < completeSet.length; i++){
                if (!completeSet[i].className.match(genetify.re.elementsMarker)){
                    originals.push(completeSet[i]);
                }
            }

            var selectedVariant = genetify._selectVariant(g, originals, geneDict[g]);

            //TODO: this is pretty gnarly... refactor?
            for (var j=0; j < geneDict[g].length; j++){
                // extra loop because of possible multiple elements per variant
                for (var k=0; k < geneDict[g][j][1].length; k++){
                    var baseClassname = geneDict[g][j][1][k].className.replace(' genetify_disabled', '').replace(' genetify_enabled', '');
                    if (geneDict[g][j][0] != selectedVariant[0]){
                        geneDict[g][j][1][k].className = baseClassname + ' genetify_disabled';
                    }
                    else {
                        geneDict[g][j][1][k].className = baseClassname + ' genetify_enabled';
                    }
                }
            }
        }
    },

    switchAdditiveRules: function(selectorDict){
        //TODO: what about multiple conflicting rules?
        for (var s in selectorDict){
            var selectedVariant = genetify._selectVariant(s, null, selectorDict[s]);
            var elems = genetify.utils.getElementsBySelector(s);
            genetify.utils.assert(!genetify.utils.empty(elems), 'No elements correspond to ' + s);
            for (var i=0; i < elems.length; i++){
                var baseClassname = elems[i].className.replace(genetify.re.additiveCSSRulesReplacer, '');
                if (selectedVariant[0] != '__original__'){
                    elems[i].className = baseClassname + ' ' + selectedVariant[1];
                }
                else {
                    elems[i].className = baseClassname;
                }
            }
        }
    },

    _groupVariantsByGeneName: function(iterableObj, re, getGeneAndVariantName){
        if (typeof(getGeneAndVariantName) != 'function'){
            var getGeneAndVariantName = function(matches){
                return [matches[1], matches[2]];
            };
        }
        var geneDict = {};
        for (var p in iterableObj){
            //TODO: is this likely to break because it is not using actual variantMarker?
            // optimization to avoid regex... 4x speedup
            if (p.indexOf('v') == -1){
                continue;
            }
            var matches = re.exec(p);
            if (matches){
                //TODO: find better solution
                matches[0] = p; //because bug in IE

                var names = getGeneAndVariantName(matches);
                if (names.length == 2){
                    if (!geneDict[names[0]]){
                        geneDict[names[0]] = [];
                    }
                    geneDict[names[0]].push([names[1], iterableObj[p]]);
                }
            }
        }
        return geneDict;
    },

    _forAllCSSRules: function(func){
        var self = genetify; //use local name for speed
        if (self._cssSheetCount != document.styleSheets.length){
            self._cacheCSSRules();
        }
        var len = self._cssRulesCache.length; //for speed
        for (var i=0; i < len; i++){
            func(self._cssRulesCache[i]);
        }
    },

    _cacheCSSRules: function(){
        //TODO: weird Safari bug
        genetify.utils.assert(
            document.styleSheets.length,
            'No stylesheets detected.'
        );

        var self = genetify; //use local name for speed
        for (var i=self._cssSheetCount; i < document.styleSheets.length; i++){
            var ss = document.styleSheets[i];
            try {
                var rules = ss.cssRules || ss.rules; //for IE
                var len = rules.length; //for speed
                for (var j=0; j < len; j++){
                    // because Safari returns some non-style rules
                    if (rules[j].selectorText){
                        self._cssRulesCache.push(rules[j]);
                    }
                    else if (rules[j].type == 3){
                        //TODO: what to do about CSS @imports ?
                        if (typeof(check) == 'undefined'){
                            var check = setTimeout(function(){
                                genetify.utils.assert(
                                    !genetify.utils.empty(genetify.genome),
                                    'Genome is empty and CSS @imports detected'
                                );
                            }, 2000);
                        }
                    }
                }
            }
            catch(err){
                // suppress security errors on accessing remote stylesheet
                //TODO: log as error?
            }
        }
        self._cssSheetCount = document.styleSheets.length;
    }

};

genetify.scanJS = {

    _getRaw: function(){
        //TODO: better IE detect
        genetify.utils.assert(document.scripts,
            'This function is only meant for IE'
        );
        var rawJavascript = '';
        for (var i=0; i < document.scripts.length; i++){
            rawJavascript += document.scripts[i].innerHTML;
        }
        return rawJavascript;
    },

    _parseIdentifiers: function(javascript){
        // todo: optimize
        var reCommentOneline = /\/\/.*/g;
        var reCommentMultiline = /\*.*?\*\//g;
        var reIdentifier = /([a-zA-Z_$][a-zA-Z0-9_$]*)/g;

        var matches = javascript.replace(reCommentMultiline, '').replace(reCommentOneline, '').match(reIdentifier);
        return matches;
    },

    _getObjectsThatExist: function(matches){
        var userDict = {};
        // todo: optimize
        for (var i=0; i < matches.length; i++){
            if (!userDict[matches[i]] && window[matches[i]]){
                userDict[matches[i]] = window[matches[i]];
            }
        }
        return userDict;
    },

    getUserDict: function(){
        var self = genetify.scanJS;
        return self._getObjectsThatExist(self._parseIdentifiers(self._getRaw()));
    }

};

genetify.record = {

    goal: function(name, value, category /*optional*/){
        //TODO: regex validate name
        genetify.utils.assert(name, 'Goal name required');
        genetify.utils.assert(
            typeof(value) == 'number',
            'Goal value must be a number, not ' + value
        );
        //TODO: handle negative values
        genetify.utils.assert(
            value > 0,
            'Goal value must be greater than zero, not ' + value
        );
        genetify.utils.assert(
            genetify.pageview_xid,
            'Pageview is missing'
        );

        var queryDict = {
            'goal': name,
            'pageview_xid': genetify.pageview_xid,
            'value': value
            //TODO: send category info to server
        };
        //genetify.utils.insertScript(genetify.utils.buildURL('/content/gen/', queryDict));
		sendPostRequest(genetify.utils.buildURL('/content/gen/', queryDict));

        if (genetify.config.USE_URCHIN){
            genetify.record.urchin(name, value, category);
        }
    },

    // //TODO: explicit vs implicit args?
    pageview: function(genome, referrer, varyCall){
        genetify.utils.assert(
            !genetify.utils.empty(genome),
            'Genome is empty'
        );

        var f = genetify.utils.genomeToURLFragment(genome);
        var rStr = genetify.utils.genomeToURLFragment(referrer);

        genetifyTime.time = {
            'load': genetifyTime.end.load - genetifyTime.begin.load,
            'init': genetifyTime.end.init - genetifyTime.end.load,
            'results': genetifyTime.end.results - genetifyTime.begin.results,
            'idle': genetifyTime.begin.vary - genetifyTime.end.results,
            'vary': genetifyTime.end.vary - genetifyTime.begin.vary
        };
        var queryDict = {
            'pageview_xid': genetify.pageview_xid,
            'genome': f,
            'referrer': rStr,
            'vary_call': varyCall,
            'load_time': genetifyTime.time.load,
            'init_time': genetifyTime.time.init,
            'results_time': genetifyTime.time.results,
            'idle_time': genetifyTime.time.idle,
            'vary_time': genetifyTime.time.vary
        };

        //genetify.utils.insertScript(genetify.utils.buildURL('/content/gen.record.html', queryDict));
		sendPostRequest(genetify.utils.buildURL('/content/gen/', queryDict));
    },

    //TODO: test this function
    urchin: function(name, value, category /*optional*/){

        genetify.utils.assert(
            typeof(UrchinTransaction) == 'function',
            'UrchinTransaction required'
        );
        genetify.utils.assert(
            typeof(urchinTracker) == 'function',
            'urchinTracker required'
        );
        genetify.utils.assert(
            !genetify.utils.empty(genetify.genome),
            'Genome is empty'
        );

        // pageview must be recorded seperately from transaction
        genetify.record._pageToUrchin(genetify.genome);

        var tdata = {
            //TODO: use pageview_xid here?
            'order-id': name + '-' + Math.round(Math.random()*1000000000),
            'affiliation': 'genetify',
            'total': value,
            'items': [{
                'sku/code': name,
                'product name': name,
                'category': category,
                'quantity': 1,
                'price': value
            }]
        };
        var t = new UrchinTransaction(tdata);
        t.commit();
    },

    _pageToUrchin: function(genome){
        var fragment = genetify.utils.genomeToURLFragment(genome);
        var GAString = '';
        if (window.location.search){
            GAString = window.location.search + '&genome=(' + fragment + ')';
        }
        else {
            GAString = '?genome=(' + fragment + ')';
        }
        urchinTracker(genetify.config.NAMESPACE + GAString);
    },

    //TODO: is this needed anymore?
    _request: function(URL){

        var im = new Image(1,1);
        im.src = URL;

        //seems to be necessary for reliable recording
        im.onload = function(o){
            console.log('Request returned', genetify.utils.parseURL(URL));
        };

        if (URL.indexOf('error=') == -1){ //don't recurse!
            im.onerror = function(){
                genetify.record.error(URL);
            };
        }
    },

    error: function(message, url /*optional*/, lineNumber /*optional*/){

        if (message == 'Error loading script'){
            // because requests to non-existant cache files raise this error in Firefox
            return;
        }
        var queryDict = {
            'error': message,
            'line_number': lineNumber || 0
        };
        // don't insertscript in case that is faulty
        //genetify.record._request(genetify.utils.buildURL('/content/gen.record.html', queryDict));
		sendPostRequest(genetify.utils.buildURL('/content/gen/', queryDict));
    }

};

genetify.cookie = {

    init: function(){
        var cookieSwitch = genetify.cookie.read('genetify_use_cookie');
        if (cookieSwitch){
            genetify.config.USE_COOKIE = cookieSwitch * 1;
        }
        var page = genetify.cookie.read('genetify_genome_page');
        if (genetify.config.USE_COOKIE && page == genetify.config.NAMESPACE){
            var cookieData = genetify.cookie.read('genetify_genome');
            // TODO: re-init conflict with URL data?
            genetify.utils.update(genetify.genomeOverride, genetify.utils.fragmentToGenome(cookieData));
        }
        genetify.pageview_xid = genetify.cookie.read('genetify_pageview_xid');
    },

    save: function(genome, page){
        //TODO: 4k cookie warning
        var cookieData = genetify.cookie.read('genetify_genome');
        var oldGenome = genetify.utils.fragmentToGenome(cookieData);
        //TODO: is overwriting always best... what about name conflict?
        //TODO: wouldn't it be better to add cookie data to genome at init?
        var newGenome = genetify.utils.update(oldGenome, genome);

        genetify.cookie._write('genetify_genome', genetify.utils.genomeToURLFragment(newGenome));
        genetify.cookie._write('genetify_genome_page', page);

        //TODO: record series of pageviews
        // var pageviewsData = genetify.cookie.read('genetify_pageviews');
        // var str = (pageviewsData) ? pageviewsData + ',' + genetify.pageview_xid : genetify.pageview_xid;
        genetify.cookie._write('genetify_pageview_xid', genetify.pageview_xid);
    },

    enable: function(){
        genetify.cookie._write('genetify_use_cookie', 1);
        genetify.cookie.init();
    },

    disable: function(){
        genetify.cookie._write('genetify_use_cookie', 0);
        // TODO: re-init conflict with URL data?
        genetify.genomeOverride = {};
        genetify.cookie.init();
    },

    _write: function(name, value, hoursToExpiry){
        //TODO: best expiry? session or time?
        //TODO: trim subdomains? or let user set document.domain?
        if (!hoursToExpiry){
            var hoursToExpiry = 1;
        }
        var exp = new Date();
    	exp.setTime(exp.getTime() + (hoursToExpiry * 60 * 60 * 1000));
    	var domain = document.domain;
        //genetify.utils.assert(domain != 'localhost', 'Cookies don\'t work on localhost');
        var str = name + '=' + encodeURIComponent(value) + '; expires=' + exp.toGMTString() + '; domain=' + domain + '; path=/';
    	document.cookie = str;
    },

    read: function(name){
        if (name.indexOf('=') != name.length-1){ name = name + '='; }
    	var pos = document.cookie.indexOf(name);
        if (pos != -1) {
            var start = pos + name.length;
    		var end = document.cookie.indexOf(';', start);
    		if (end == -1){ end = document.cookie.length; }
    		var value = document.cookie.substring(start, end);
    		return decodeURIComponent(value);
    	}
    }

};

genetify.utils = {
    // thanks mochikit!
    update: function (self, obj/*, ... */) {
        if (self === null || self === undefined) {
            self = {};
        }
        for (var i = 1; i < arguments.length; i++) {
            var o = arguments[i];
            if (typeof(o) != 'undefined' && o !== null) {
                for (var k in o) {
                    self[k] = o[k];
                }
            }
        }
        return self;
    },

    sum: function(numbers){
        var sum = 0;
        for (var j=0; j < numbers.length; j++){
            sum += numbers[j];
        }
        return sum;
    },

    empty: function(obj){
        var empty = true;
        for (var p in obj){
            if (obj[p]){
                empty = false;
                break;
            }
        }
        return empty;
    },

    assert: function(test, message){
        if (!test){
            //TODO: Firebug stack trace not working
            // if (console.trace && window.location.href.indexOf('localhost') != -1){
            //     console.trace();
            // }
            throw('Genetify: ' + message);
        }
    },

    parseURL: function(URL){
        // adapted from https://code.poly9.com/trac/wiki/URLParser
        var groupNames = {'username' : 4, 'password' : 5, 'port' : 7, 'protocol' : 2, 'host' : 6, 'pathname' : 8, 'URL' : 0, 'queryString' : 9, 'fragment' : 10};
        var reURL = /^((\w+):\/\/)?((\w+):?(\w+)?@)?([^\/\?:]+):?(\d+)?(\/?[^\?#]+)?\??([^#]+)?#?(\w*)/;

        var matches = reURL.exec(URL);
        var URLObj = {};
        for (var p in groupNames){
            URLObj[p] = matches[groupNames[p]] || '';
        }

        // adapted from MochiKit
        var pairs = URLObj['queryString'].replace(/\+/g, "%20").split(/(\&amp\;|\&\#38\;|\&#x26;|\&)/);
        URLObj['params'] = {};
        for (i = 0; i < pairs.length; i++) {
            var pair = pairs[i].split("=");
            var name = pair.shift();
            if (!name) continue;
            URLObj['params'][decodeURIComponent(name)] = decodeURIComponent(pair.join("="));
        }

        return URLObj;
    },

    insertScript: function(src){
        var script = document.createElement('script');
        script.type = "text/javascript";
        script.src = src;
        document.getElementsByTagName('head')[0].appendChild(script);
    },

    fragmentToGenome: function(fragment){
        var dict = {};
        if (!fragment){
            return dict;
        }
        else {
            var keyValues = fragment.split(',');
            for (var i=0; i < keyValues.length; i++){
                var kv = keyValues[i].split('=');
                if (kv[1] == '_'){ //for convenience
                    kv[1] = '__original__';
                }
                dict[kv[0]] = kv[1];
            }
            return dict;
        }
    },

    genomeToURLFragment: function(genome){
        var kv = [];
        for (var p in genome){
            //TODO: any escaping?
            kv.push(p + '=' + genome[p]);
        }
        kv.sort();
        return kv.join(',');
    },

    round: function(num){
        //TODO: can't we do better precision ?
        return Math.round(num * 1000) / 1000;
    },

    buildURL: function(relativePath, queryDict){
        var defaults = {
            'domain': document.domain,
            'page': genetify.config.NAMESPACE,
            'rand':  Math.round(Math.random()*1000000),
            'callback': 'console.info',
            'errback': 'console.error'
        };
        queryDict = genetify.utils.update(defaults, queryDict);

        var pairs = [];
		var path = "";
        for (var key in queryDict){
            if (key == 'genome') {
				path="genome"
				genes = queryDict["genome"].split(",");
				for (var g in genes) {
					var n = genes[g].split("=");
					pairs.push('./genes/' + n[0] + '=' + encodeURIComponent(n[1]));
				}
			} else if (key == 'goal'){
				path = 'goal/' + queryDict[key];			
				pairs.push('./' + key + '=' + encodeURIComponent(queryDict[key]));
			} else {						
				pairs.push('./' + key + '=' + encodeURIComponent(queryDict[key]));
			}
        }
		if(relativePath != null && relativePath.indexOf('/content' == 0)) {
			if (relativePath.indexOf(".json") == -1) {
				return relativePath + queryDict['domain'] + '/' + path + '/*?' + pairs.join('&'); // recorder
			} else {
				return relativePath + '?' + pairs.join('&'); // reader
			}
		} else {
        	return genetify.config.REMOTE_BASE_URL + relativePath + '?' + pairs.join('&');
		}
    },

    // adapted from Prototype
    _getElementsByXPath: function(expression) {
        var results = [];
        var query = document.evaluate(expression, document,
            null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        for (var i = 0, length = query.snapshotLength; i < length; i++)
            results.push(query.snapshotItem(i));
        return results;
    },

    getElementsByClassName: function(className) {
      if (document.evaluate) {
        var q = ".//*[contains(concat(' ', @class, ' '), ' " + className + " ')]";
        return genetify.utils._getElementsByXPath(q);
      } else {
        var classElements = new Array();
        var els = document.getElementsByTagName('*');
        var elsLen = els.length;
        var pattern = new RegExp("(^|\\s)"+className+"(\\s|$)");
        for (i = 0, j = 0; i < elsLen; i++) {
             if ( pattern.test(els[i].className) ) {
                     classElements[j] = els[i];
                     j++;
             }
        }
        return classElements;
     }
    },

    //TODO: remove lint bugs
    //TODO: replace with more mordern function?
    //TODO: use library function when present?
    // adapted from Simon Willison 2004
    getElementsBySelector: function(_2){ var getAllChildren = function(e){ return e.all?e.all:e.getElementsByTagName("*"); }; if(!document.getElementsByTagName){ return new Array(); } var _3=_2.split(" "); var _4=new Array(document); for(var i=0;i<_3.length;i++){ token=_3[i].replace(/^\s+/,"").replace(/\s+$/,""); if(token.indexOf("#")>-1){ var _6=token.split("#"); var _7=_6[0]; var id=_6[1]; var _9=document.getElementById(id); if(_7&&_9.nodeName.toLowerCase()!=_7){ return new Array(); } _4=new Array(_9); continue; } if(token.indexOf(".")>-1){ var _6=token.split("."); var _7=_6[0]; var _a=_6[1]; if(!_7){ _7="*"; } var _b=new Array; var _c=0; for(var h=0;h<_4.length;h++){ var _e; if(_7=="*"){ _e=getAllChildren(_4[h]); }else{ _e=_4[h].getElementsByTagName(_7); } for(var j=0;j<_e.length;j++){ _b[_c++]=_e[j]; } } _4=new Array; var _10=0; for(var k=0;k<_b.length;k++){ if(_b[k].className&&_b[k].className.match(new RegExp("\\b"+_a+"\\b"))){ _4[_10++]=_b[k]; } } continue; } if(token.match(/^(\w*)\[(\w+)([=~\|\^\$\*]?)=?"?([^\]"]*)"?\]$/)){ var _7=RegExp.$1; var _12=RegExp.$2; var _13=RegExp.$3; var _14=RegExp.$4; if(!_7){ _7="*"; } var _b=new Array; var _c=0; for(var h=0;h<_4.length;h++){ var _e; if(_7=="*"){ _e=getAllChildren(_4[h]); }else{ _e=_4[h].getElementsByTagName(_7); } for(var j=0;j<_e.length;j++){ _b[_c++]=_e[j]; } } _4=new Array; var _10=0; var _15; switch(_13){ case "=": _15=function(e){ return (e.getAttribute(_12)==_14); }; break; case "~": _15=function(e){ return (e.getAttribute(_12).match(new RegExp("\\b"+_14+"\\b"))); }; break; case "|": _15=function(e){ return (e.getAttribute(_12).match(new RegExp("^"+_14+"-?"))); }; break; case "^": _15=function(e){ return (e.getAttribute(_12).indexOf(_14)==0); }; break; case "$": _15=function(e){ return (e.getAttribute(_12).lastIndexOf(_14)==e.getAttribute(_12).length-_14.length); }; break; case "*": _15=function(e){ return (e.getAttribute(_12).indexOf(_14)>-1); }; break; default: _15=function(e){ return e.getAttribute(_12); }; } _4=new Array; var _10=0; for(var k=0;k<_b.length;k++){ if(_15(_b[k])){ _4[_10++]=_b[k]; } } continue; } if(!_4[0]){ return; } _7=token; var _b=new Array; var _c=0; for(var h=0;h<_4.length;h++){ var _e=_4[h].getElementsByTagName(_7); for(var j=0;j<_e.length;j++){ _b[_c++]=_e[j]; } } _4=_b; } return _4; }

};

//TODO: split test off into optional file

genetify.test = {

    _currentGeneName: '',
    _currentVariantNames: [],
    delay: 300,

    results: function(geneName, variantNames){

        //TODO: multiple distribution tests of results
        // if (!probs){
        //     // default even prob
        //     for (var i=0; i < variantNames.length; i++){
        //         probs[i] = 1 / variantNames.length;
        //     }
        // }
        //
        // genetify.utils.assert(probs.length == variantNames.length)

        if (variantNames.indexOf('__original__') == -1){
            variantNames.push('__original__');
        }

        //TODO: safety checks so it won't delete data! ... change namespace?
        // in case page has already been varied
        genetify.controls.reset();
        genetify.genome = {};

        // record random subset of variants
        var leaveOut = genetify._getRandomVariant(variantNames);
        // var leaveOut = '';

        for (var i=0; i < variantNames.length; i++){

            // stagger requests for database performance
            var requestAfterDelay = function(variantName, delay){
                setTimeout(function(){
                    genetify.genome[geneName] = variantName;
                    genetify.pageview_xid = genetify._generateID();
                    genetify.record.pageview(genetify.genome, genetify.referrer);
                    genetify.record.goal('__test__', 1);
                }, delay);
            };

            if (variantNames[i] != leaveOut){
                requestAfterDelay(variantNames[i], i * genetify.test.delay);
            }
        }

        // //TODO: better way to pass info to callback?
        genetify.test._currentGeneName = geneName;
        genetify.test._currentVariantNames = variantNames;

        //to give time for database
        setTimeout(function(){
            genetify.requestResults('genetify.test.processResults', true);
        }, (i + 3) * genetify.test.delay);
    },

    processResults: function(JSON){
        genetify.handleResults(JSON);
        genetify.test._checkResults(genetify.test._currentGeneName, genetify.test._currentVariantNames);
        genetify.controls.reset();
    },

    _checkResults: function(geneName, variantNames){

        // to conform to function params
        var variants = [];
        for (var i=0; i < variantNames.length; i++){
            variants[i] = [variantNames[i], null];
        }
        // this will adjust missing results
        var probs = genetify._getProbabilities(genetify.results[geneName], variants);

        // genetify.controls.printProbs();
        for (var k=0; k < variantNames.length; k++){
            if (genetify.results[geneName]){
                var expectedProb = 1 / variantNames.length;
                probs[k] = genetify.utils.round(probs[k]);
                genetify.utils.assert(
                    expectedProb == probs[k],
                    'Expected probability ' + expectedProb + ', got ' + probs[k]
                );
                console.log(variantNames[k] + ', p=' + probs[k]);
            }
        }

        var sum = genetify.utils.round(genetify.utils.sum(probs));
        genetify.utils.assert(sum == 1, 'Weights add up to ' + sum + ' for ' + geneName);
        console.log('PASSED: Probabilities match expected');
    },

    variants: function(geneName, variantNames, geneType /*optional*/){
        //TODO: safety checks so it won't delete data! ... change namespace?

        if (variantNames.indexOf('__original__') == -1){
            variantNames.push('__original__');
        }

        console.log('Checking expression of variants', variantNames, 'in gene', geneName);

        genetify.genomeOverride = {};

        var checked = [];
        var iterations_per_variant = 6; //to make sure all are seen
        for (var i=0; i < variantNames.length * iterations_per_variant; i++){
            // stagger requests for database performance
            setTimeout(function (){
                genetify.controls.reVary(geneType || 'all');
                for (var k=0; k < variantNames.length; k++){
                    if (genetify.genome[geneName] == variantNames[k]){
                        checked[k] = 1;
                    }
                }
            }, i * genetify.test.delay);
        }

        setTimeout(function(){
            genetify.controls.reset();
            genetify.utils.assert(
                genetify.utils.sum(checked) == variantNames.length,
                'Not all variants were present in genome'
            );
            console.log('PASSED: All variants expressed');
        }, i * genetify.test.delay);
    }

};

genetify.controls = {

    _timer: false,

    load: function(){
        //TODO: fix controls in IE
        genetify.controls._insertStylesheet(genetify.config.REMOTE_BASE_URL + '/controls.css');
        genetify.utils.insertScript(genetify.config.REMOTE_BASE_URL + '/controls.js');
    },

    remove: function(){
        var elem = document.getElementById('genetify_controls');
        if (elem){
            elem.parentNode.removeChild(elem);
        }
    },

    _insertStylesheet: function(src){
        var link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = src;
        link.type = 'text/css';
        document.getElementsByTagName('head')[0].appendChild(link);
    },

    _insertHTML: function(id, HTML){
        var elem = document.getElementById(id);
        if (!elem){
            elem = document.createElement('div');
            elem.id = id;
            document.getElementsByTagName('body')[0].appendChild(elem);
        }
        elem.innerHTML = HTML;
    },

    _refreshResults: function(){
        if (genetify.controls._timer){
            clearTimeout(genetify.controls._timer);
            genetify.controls._timer = false;
        }

        genetify.controls._timer = setTimeout(function(){
                genetify.requestResults('genetify.handleResults', true);
            },
            genetify.test.delay
        );
    },

    reVary: function(geneType){
        genetify.genome = {};
        genetify.vary(geneType);
        // console.log(genetify.genome, genetifyTime.time.vary + 'ms');
        //TODO: this does nothing until server updates vary counts
        // genetify.controls._refreshResults();
    },

    goal: function(value){
        //TODO: user input of goal value

        if (!value){
            value = Math.round(Math.random()*99) + 1;
        }

        genetify.record.goal('genetify.controls.goal', value);
        genetify.controls._refreshResults();
    },

    reset: function(){
        var queryDict = {
            //TODO: change name to reset?
            'delete': true
        };
        genetify.utils.insertScript(genetify.utils.buildURL('/delete.php', queryDict));
        genetify.controls._refreshResults();
    },

    viewGraphs: function(){
        var src = genetify.utils.buildURL('/graphs.php', {});
        window.open(src, 'graphs.php');
    },

    getGraphURL: function(geneName, chart){
        var queryDict = {
            'gene': geneName,
            'chart': chart
        };
        var src = genetify.utils.buildURL('/pygooglechart/graph.py', queryDict);
        return src;
    },

    requestGraph: function(graphName, geneName, chart){
        var graph = document.getElementById(graphName);
        graph.src = genetify.controls.getGraphURL(geneName, chart);
    },

    //TODO: do something so genome passed in cookie is also shown
    printProbs: function(){
        var lines = [];
        if (!genetify.config.REQUEST_RESULTS){
            console.log('Results not requested');
        }
        else if (genetify.utils.empty(genetify.results)){
            console.warn('No results found');
        }
        else {
            for (var p in genetify.genome){
                var variantName = genetify.genome[p];
                var key = p + '->' + variantName;
                if (genetify.results[p] && genetify.results[p][variantName]){
                    var prob = Math.round(genetify.results[p][variantName]['weight']*100)/100;
                    if (prob === 0){
                        lines.push(key + ', p=undefined');
                    }
                    else {
                        lines.push(key + ', p=' + prob);
                    }
                    //TODO: better handling of unused and missing results
                    if (genetify.utils.empty(genetify.genomeOverride)
                        && !genetify.utils.empty(genetify._allocateUnused(genetify.results[p], [0]))){
                        console.warn('Unused results for ' + p);
                    }
                }
                else {
                    lines.push(key + ', results not found');
                }
            }
        }
        console.log(lines.join('\n'));
        return lines.join('\n');
    },

    //TODO: do something so genome passed in cookie is also shown
    //TODO: better handling of unused and missing results
    resultsToTable: function(){
        //TODO: make column headers dynamic
        var headers = ['name', 'count', 'sum', 'avg', 'stddev', 'share', 'weight'];
        var rows = [headers];

        if (!genetify.config.REQUEST_RESULTS){
            //TODO: get results anyway
            console.log('Results not requested');
        }
        else if (genetify.utils.empty(genetify.results)){
            console.warn('No results found');
        }
        else {
            //TODO: use current genes on page??
            for (var p in genetify.results){
                rows.push([p]);
                var gene = genetify.results[p];

                for (var variantName in gene){
                    var row = [variantName];
                    for (var col in gene[variantName]){

                        var value = gene[variantName][col];
                        if (typeof(value) == 'number'){
                            value = genetify.utils.round(value);
                        }
                        row.push(value);

                    }
                    rows.push(row);
                }

            }
        }
        return rows;
    },

    showResults: function(){
        var rows = genetify.controls.resultsToTable();

        var HTML = '<table id="genetify_results_table">';
        for (var i=0; i < rows.length; i++){

            var rowTag = 'tr';
            HTML += '<' + rowTag + '>';

            cols = rows[i];

            for (var j=0; j < cols.length; j++){

                var extra = ' class="genetify_col_' + rows[0][j] + '"';

                if (cols.length === 1){
                    extra = ' colspan="' + rows[i+1].length + '"';
                    extra += ' class="genetify_gene_row"';
                }

                var colTag = '';
                if (i === 0){
                    colTag = 'th';
                }
                else {
                    colTag = 'td';
                }

                HTML += '<' + colTag + extra + '>' + cols[j] + '</' + colTag + '>';
            }

            HTML += '</' + rowTag + '>';
        }
        HTML += '</table>';

        genetify.controls._insertHTML('genetify_results', HTML);
    }

};

//TODO: why is this needed?
// firebug won't print later unless it is invoked here!
console.log('Firebug', console.firebug, 'is working');

// to enable external configuration
if (typeof(GENETIFY_CONFIG) != 'undefined'){
    for (var p in GENETIFY_CONFIG){
        genetify.utils.assert(p in genetify.config, 'Invalid configuration variable ' + p);
    }
    genetify.config = genetify.utils.update(genetify.config, GENETIFY_CONFIG);
    delete(GENETIFY_CONFIG); //to show that it has been used up
}

//TODO: safari load time is really slow!
genetifyTime.end.load = new Date().getTime();

genetify.init();

genetifyTime.end.init = new Date().getTime();
