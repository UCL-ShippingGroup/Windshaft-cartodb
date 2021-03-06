var step = require('step');
var assert = require('assert');
var _ = require('underscore');
var templateName = require('../template_maps').templateName;
var CdbRequest = require('../models/cdb_request');
var NamedMapsCacheEntry = require('../cache/model/named_maps_entry');

function NamedMapsController(app, serverOptions, templateMaps, metadataBackend, templateBaseUrl, surrogateKeysCache) {
    this.app = app;
    this.serverOptions = serverOptions;
    this.templateMaps = templateMaps;
    this.metadataBackend = metadataBackend;
    this.templateBaseUrl = templateBaseUrl;
    this.surrogateKeysCache = surrogateKeysCache;
}

module.exports = NamedMapsController;

var cdbRequest = new CdbRequest();

NamedMapsController.prototype.register = function(app) {
    app.get(this.templateBaseUrl + '/:template_id/jsonp', this.jsonp.bind(this));
    app.post(this.templateBaseUrl, this.create.bind(this));
    app.put(this.templateBaseUrl + '/:template_id', this.update.bind(this));
    app.get(this.templateBaseUrl + '/:template_id', this.retrieve.bind(this));
    app.del(this.templateBaseUrl + '/:template_id', this.destroy.bind(this));
    app.get(this.templateBaseUrl, this.list.bind(this));
    app.options(this.templateBaseUrl + '/:template_id', this.options.bind(this));
    app.post(this.templateBaseUrl + '/:template_id', this.instantiate.bind(this));
};

// Add a template
NamedMapsController.prototype.create = function(req, res) {
    var self = this;

    this.app.doCORS(res);

    var cdbuser = cdbRequest.userByReq(req);

    step(
        function checkPerms(){
            self.serverOptions.authorizedByAPIKey(req, this);
        },
        function addTemplate(err, authenticated) {
            assert.ifError(err);
            ifUnauthenticated(authenticated, 'Only authenticated users can get template maps');
            ifInvalidContentType(req, 'template POST data must be of type application/json');
            var cfg = req.body;
            self.templateMaps.addTemplate(cdbuser, cfg, this);
        },
        function prepareResponse(err, tpl_id){
            assert.ifError(err);
            return { template_id: tpl_id };
        },
        finishFn(self.app, res, 'POST TEMPLATE')
    );
};

// Update a template
NamedMapsController.prototype.update = function(req, res) {
    var self = this;

    this.app.doCORS(res);

    var cdbuser = cdbRequest.userByReq(req);
    var template;
    var tpl_id;
    step(
        function checkPerms(){
            self.serverOptions.authorizedByAPIKey(req, this);
        },
        function updateTemplate(err, authenticated) {
            assert.ifError(err);
            ifUnauthenticated(authenticated, 'Only authenticated user can update templated maps');
            ifInvalidContentType(req, 'template PUT data must be of type application/json');

            template = req.body;
            tpl_id = templateName(req.params.template_id);
            self.templateMaps.updTemplate(cdbuser, tpl_id, template, this);
        },
        function prepareResponse(err){
            assert.ifError(err);

            return { template_id: tpl_id };
        },
        finishFn(self.app, res, 'PUT TEMPLATE')
    );
};

// Get a specific template
NamedMapsController.prototype.retrieve = function(req, res) {
    var self = this;

    if (req.profiler) {
        req.profiler.start('windshaft-cartodb.get_template');
    }

    this.app.doCORS(res);

    var cdbuser = cdbRequest.userByReq(req);
    var tpl_id;
    step(
        function checkPerms(){
            self.serverOptions.authorizedByAPIKey(req, this);
        },
        function updateTemplate(err, authenticated) {
            assert.ifError(err);
            ifUnauthenticated(authenticated, 'Only authenticated users can get template maps');

            tpl_id = templateName(req.params.template_id);
            self.templateMaps.getTemplate(cdbuser, tpl_id, this);
        },
        function prepareResponse(err, tpl_val) {
            if ( err ) throw err;
            if ( ! tpl_val ) {
                err = new Error("Cannot find template '" + tpl_id + "' of user '" + cdbuser + "'");
                err.http_status = 404;
                throw err;
            }
            // auth_id was added by ourselves,
            // so we remove it before returning to the user
            delete tpl_val.auth_id;
            return { template: tpl_val };
        },
        finishFn(self.app, res, 'GET TEMPLATE')
    );
};

// Delete a specific template
NamedMapsController.prototype.destroy = function(req, res) {
    var self = this;

    if (req.profiler) {
        req.profiler.start('windshaft-cartodb.delete_template');
    }
    this.app.doCORS(res);

    var cdbuser = cdbRequest.userByReq(req);
    var tpl_id;
    step(
        function checkPerms(){
            self.serverOptions.authorizedByAPIKey(req, this);
        },
        function updateTemplate(err, authenticated) {
            assert.ifError(err);
            ifUnauthenticated(authenticated, 'Only authenticated users can delete template maps');

            tpl_id = templateName(req.params.template_id);
            self.templateMaps.delTemplate(cdbuser, tpl_id, this);
        },
        function prepareResponse(err/*, tpl_val*/){
            if ( err ) throw err;
            return { status: 'ok' };
        },
        finishFn(self.app, res, 'DELETE TEMPLATE', ['', 204])
    );
};

// Get a list of owned templates
NamedMapsController.prototype.list = function(req, res) {
    var self = this;
    if ( req.profiler ) {
        req.profiler.start('windshaft-cartodb.get_template_list');
    }
    this.app.doCORS(res);

    var cdbuser = cdbRequest.userByReq(req);

    step(
        function checkPerms(){
            self.serverOptions.authorizedByAPIKey(req, this);
        },
        function listTemplates(err, authenticated) {
            assert.ifError(err);
            ifUnauthenticated(authenticated, 'Only authenticated user can list templated maps');

            self.templateMaps.listTemplates(cdbuser, this);
        },
        function prepareResponse(err, tpl_ids){
            assert.ifError(err);
            return { template_ids: tpl_ids };
        },
        finishFn(self.app, res, 'GET TEMPLATE LIST')
    );
};

NamedMapsController.prototype.instantiate = function(req, res) {
    var self = this;

    if (req.profiler) {
        req.profiler.start('windshaft-cartodb.instance_template_post');
    }
    step(
        function() {
            ifInvalidContentType(req, 'template POST data must be of type application/json');

            self.instantiateTemplate(req, res, req.body, this);
        }, function(err, response) {
            self.finish_instantiation(err, response, res);
        }
    );
};

NamedMapsController.prototype.options = function(req, res, next) {
    this.app.doCORS(res, "Content-Type");
    return next();
};

/**
 * jsonp endpoint, allows to instantiate a template with a json call.
 * callback query argument is mandatory
 */
NamedMapsController.prototype.jsonp = function(req, res) {
    var self = this;

    if (req.profiler) {
        req.profiler.start('windshaft-cartodb.instance_template_get');
    }
    step(
        function() {
            if ( req.query.callback === undefined || req.query.callback.length === 0) {
                throw new Error('callback parameter should be present and be a function name');
            }
            var config = {};
            if(req.query.config) {
                try {
                    config = JSON.parse(req.query.config);
                } catch(e) {
                    throw new Error('badformed config parameter, should be a valid JSON');
                }
            }
            self.instantiateTemplate(req, res, config, this);
        }, function(err, response) {
            self.finish_instantiation(err, response, res);
        }
    );
};


// Instantiate a template
NamedMapsController.prototype.instantiateTemplate = function(req, res, template_params, callback) {
    var self = this;

    this.app.doCORS(res);

    var template;
    var layergroup;
    var fakereq; // used for call to createLayergroup
    var cdbuser = cdbRequest.userByReq(req);
    // Format of template_id: [<template_owner>]@<template_id>
    var tpl_id = templateName(req.params.template_id);
    var auth_token = req.query.auth_token;
    step(
        function getTemplate(){
            self.templateMaps.getTemplate(cdbuser, tpl_id, this);
        },
        function checkAuthorized(err, templateValue) {
            if ( req.profiler ) req.profiler.done('getTemplate');
            if ( err ) throw err;
            if ( ! templateValue ) {
                err = new Error("Template '" + tpl_id + "' of user '" + cdbuser + "' not found");
                err.http_status = 404;
                throw err;
            }

            template = templateValue;

            var authorized = false;
            try {
                authorized = self.templateMaps.isAuthorized(template, auth_token);
            } catch (err) {
                // we catch to add http_status
                err.http_status = 403;
                throw err;
            }
            if ( ! authorized ) {
                err = new Error('Unauthorized template instanciation');
                err.http_status = 403;
                throw err;
            }

            if (req.profiler) {
                req.profiler.done('authorizedByCert');
            }

            return self.templateMaps.instance(template, template_params);
        },
        function prepareParams(err, instance){
            if ( req.profiler ) req.profiler.done('TemplateMaps_instance');
            if ( err ) throw err;
            layergroup = instance;
            fakereq = {
                query: {},
                params: {
                    user: req.params.user
                },
                headers: _.clone(req.headers),
                context: _.clone(req.context),
                method: req.method,
                res: res,
                profiler: req.profiler
            };
            self.serverOptions.setDBParams(cdbuser, fakereq.params, this);
        },
        function setApiKey(err){
            if ( req.profiler ) req.profiler.done('setDBParams');
            if ( err ) throw err;
            self.metadataBackend.getUserMapKey(cdbuser, this);
        },
        function createLayergroup(err, val) {
            if ( req.profiler ) req.profiler.done('getUserMapKey');
            if ( err ) throw err;
            fakereq.params.api_key = val;
            self.app.createLayergroup(layergroup, fakereq, this);
        },
        function prepareResponse(err, layergroup) {
            if ( err ) {
                return callback(err, { errors: [''+err] });
            }
            var tplhash = self.templateMaps.fingerPrint(template).substring(0,8);
            layergroup.layergroupid = cdbuser + '@' + tplhash + '@' + layergroup.layergroupid;
            res.header('X-Layergroup-Id', layergroup.layergroupid);

            self.surrogateKeysCache.tag(res, new NamedMapsCacheEntry(cdbuser, template.name));

            callback(null, layergroup);
        }
    );
};

NamedMapsController.prototype.finish_instantiation = function(err, response, res) {
    if (err) {
        var statusCode = 400;
        response = { errors: [''+err] };
        if ( ! _.isUndefined(err.http_status) ) {
            statusCode = err.http_status;
        }
        this.app.sendError(res, response, statusCode, 'POST INSTANCE TEMPLATE', err);
    } else {
        this.app.sendResponse(res, [response, 200]);
    }
};

function finishFn(app, res, description, okResponse) {
    return function finish(err, response){
        var statusCode = 200;
        if (err) {
            statusCode = 400;
            response = { errors: ['' + err] };
            if ( ! _.isUndefined(err.http_status) ) {
                statusCode = err.http_status;
            }
            app.sendError(res, response, statusCode, description, err);
        } else {
            app.sendResponse(res, okResponse || [response, statusCode]);
        }
    };
}

function ifUnauthenticated(authenticated, description) {
    if (authenticated !== 1) {
        var err = new Error(description);
        err.http_status = 403;
        throw err;
    }
}

function ifInvalidContentType(req, description) {
    if ( ! req.headers['content-type'] || req.headers['content-type'].split(';')[0] != 'application/json' ) {
        throw new Error(description);
    }
}
