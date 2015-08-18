(function() {
    angular
        .module('restclient', ['ngResource'])
        .provider('api', apiProvider)
        .factory('Model', ModelFactory)
        .factory('Validator', ValidatorFactory);

    /**
     * The provider to get the api
     * @constructor
     */
    function apiProvider() {
        /**
         * All the endpoints
         * @type {object}
         */
        this.endpoints = {};

        /**
         * The base route to the backend api
         * @type {string}
         */
        this.baseRoute = "";

        /**
         * Prefix of a header in a HEAD response
         * @type {string}
         */
        this.headResponseHeaderPrefix = "";

        /**
         * This class represents one configuration for an endpoint
         *
         * @constructor EndpointConfig
         */
        function EndpointConfig() {}

        /**
         * Set the route to this endpoint
         *
         * @param {string} route The endpoint route defined as string
         * @return {EndpointConfig} Returns the endpoint config object
         * @memberof EndpointConfig
         */
        EndpointConfig.prototype.route = function(route) {
            this.route = route;
            return this;
        };

        /**
         * Set the model that is used to transform the response
         *
         * @param {string} model The model defined as string
         * @return {EndpointConfig} Returns the endpoint config object
         * @memberof EndpointConfig
         */
        EndpointConfig.prototype.model = function(model) {
            this.model = model;
            return this;
        };

        /**
         * Set the container that wraps the response. Default is null.
         *
         * @param {string} container The container defined as string
         * @return {EndpointConfig} Returns the endpoint config object
         * @memberof EndpointConfig
         */
        EndpointConfig.prototype.container = function(container) {
            this.container = container;
            return this;
        };

        /**
         * Define if the response from the api is going to be an array
         *
         * @return {EndpointConfig} Returns the endpoint config object
         * @memberof EndpointConfig
         */
        EndpointConfig.prototype.actions = function(actions) {
            this.actions = actions;
            return this;
        };

        /**
         * Overwrites the baseRoute from the global configuration
         *
         * @return {EndpointConfig} Returns the endpoint config object
         * @memberof EndpointConfig
         */
        EndpointConfig.prototype.baseRoute = function(baseRoute) {
            this.baseRoute = baseRoute;
            return this;
        };

        /**
         * This is just a helper function because a merge is not supported by angular until version > 1.4
         *
         * @deprecated Will be supported by angular with version > 1.4
         * @param dst
         * @param src
         * @returns {*}
         */
        function merge(dst, src) {
            if (!angular.isDefined(dst) && !angular.isDefined(src)) return {};
            if (!angular.isDefined(dst)) return src;
            if (!angular.isDefined(src)) return dst;

            var h = dst.$$hashKey;

            if (!angular.isObject(src) && !angular.isFunction(src)) return;
            var keys = Object.keys(src);
            for (var j = 0, jj = keys.length; j < jj; j++) {
                var key = keys[j];
                var src_new = src[key];

                if (angular.isObject(src_new)) {
                    if (!angular.isObject(dst[key])) dst[key] = angular.isArray(src_new) ? [] : {};
                    this(dst[key], src_new);
                } else {
                    dst[key] = src_new;
                }
            }

            if (h) {
                dst.$$hashKey = h;
            } else {
                delete dst.$$hashKey;
            }

            return dst;
        }

        /**
         * Class representing an Endpoint with all the functionality for receiving, saving and updating data from the backend
         *
         * @param {string} endpoint The name of the endpoint
         * @param {EndpointConfig} endpointConfig Config of the endpoint which was defined earlier
         * @param {string} baseRoute URL to the backend
         * @param {string} headResponseHeaderPrefix Prefix of head request header
         * @param {$resource} $resource The Angular $resource factory
         * @param {$log} $log The Angular $log factory
         * @param {$injector} $injector The Angular $injector factory
         * @param {$q} $q The Angular $q factory
         * @constructor Endpoint
         * @ngInject
         */
        function Endpoint(endpoint, endpointConfig, baseRoute, headResponseHeaderPrefix, $resource, $log, $injector, $q) {
            var self = this;

            if (!angular.isFunction(endpointConfig.baseRoute)) baseRoute = endpointConfig.baseRoute;

            /**
             * The name of the endpoint
             * @type {string}
             */
            this.endpointName = endpoint;

            /**
             * Prefix of a header in a HEAD response
             * @type {string}
             */
            this.headResponseHeaderPrefix = headResponseHeaderPrefix;

            /**
             * The EndpointConfig object defined for this endpoint
             * @type {EndpointConfig}
             */
            this.endpointConfig = endpointConfig;

            /**
             * An instance if the $resource factory from the angularjs library
             * @type {$resource}
             */
            this.resource = $resource(baseRoute + this.endpointConfig.route, {}, merge({
                get: {
                    method: 'GET',
                    transformResponse: function(data, headers, status) {
                        data = angular.fromJson(data);
                        if (status >= 400) return data;

                        return {
                            result: self.mapResult(angular.fromJson(data)),
                            pagination: self.getPagination(data)
                        };
                    }
                },
                save: {
                    method: 'POST',
                    transformResponse: function(data, headers, status) {
                        data = angular.fromJson(data);
                        if (status >= 400) return data;

                        return {result: self.mapResult(data)};
                    }
                },
                update: {
                    method: 'PUT',
                    transformResponse: function(data, headers, status) {
                        data = angular.fromJson(data);
                        if (status >= 400) return data;

                        return {result: self.mapResult(data)};
                    }
                },
                head: {
                    method: 'HEAD'
                },
                remove: {
                    method: 'DELETE'
                }
            }, endpointConfig.actions));

            /**
             * An instance if the $log factory from the angularjs library
             * @type {$log}
             */
            this.log = $log;

            /**
             * An instance if the $injector factory from the angularjs library
             * @type {$injector}
             */
            this.injector = $injector;

            /**
             * An instance if the $q factory from the angularjs library
             * @type {$q}
             */
            this.q = $q;
        }
        Endpoint.$inject = ["endpoint", "endpointConfig", "baseRoute", "headResponseHeaderPrefix", "$resource", "$log", "$injector", "$q"];

        /**
         * Extract the pagination data from the result
         *
         * @private
         * @param {object} data Object or array of raw data
         * @return {object}
         * @memberof Endpoint
         */
        Endpoint.prototype.getPagination = function(data) {
            if (
                angular.isDefined(data.count) &&
                    angular.isDefined(data.limit) &&
                    angular.isDefined(data.skip) &&
                    data.limit > 0
            ) {
                // Calc the number of pages and generate array
                data.pagesArray = [];

                var pages = data.count / data.limit;
                if (pages % 1 !== 0) pages = Math.ceil(pages);

                for (var i=1; i<=pages; i++) data.pagesArray.push(i);

                var currentPage = parseInt(data.skip / data.limit + 1);
                var currentPageItemsCount = data.limit;
                if (data.skip+1+data.limit > data.count) currentPageItemsCount = data.count - ((currentPage-1)*data.limit);

                return {
                    count: data.count,
                    limit: data.limit,
                    skip: data.skip,
                    pagesArray: data.pagesArray,
                    pagesCount: pages,
                    currentPage: currentPage,
                    currentPageItemsCount: currentPageItemsCount
                };
            }

            return null;
        };

        /**
         * Maps an object or array to the endpoint model
         *
         * @private
         * @param {object} data Object or array of raw data
         * @return {Model|Array}
         * @memberof Endpoint
         */
        Endpoint.prototype.mapResult = function(data) {
            var self = this;
            var result;
            self.log.debug("apiFactory (" + self.endpointName + "): Endpoint called");

            // Set the name of the wrapping container
            var container = self.endpointConfig.container;
            // Get the model object that is used to map the result
            var model = this.injector.get(self.endpointConfig.model);

            self.log.debug("apiFactory (" + self.endpointName + "): Container set to " + container);

            // Check if response is an array
            if (angular.isArray(data) || angular.isArray(data[container])) {
                self.log.debug("apiFactory (" + self.endpointName + "): Result is an array");

                var arrayData = angular.isArray(data) ? data : data[container];
                var models = [];

                // Iterate thru every object in the response and map it to a model
                angular.forEach(arrayData, function (value) {
                    models.push(new model(value));
                });

                result = models;

            } else {
                self.log.debug("apiFactory (" + self.endpointName + "): Result is NOT an array");

                // If only one object is given, map it to the model
                result = new model(data);
            }

            self.log.debug("apiFactory (" + self.endpointName + "): Mapped result is:", result);

            return result;
        };

        /**
         * Call an endpoint and map the response to one or more models given in the endpoint config
         * The server response must be an object
         *
         * @param {object} params The parameters that ether map in the route or get appended as GET parameters
         * @return {Promise<Model|Error>}
         * @memberof Endpoint
         */
        Endpoint.prototype.get = function (params) {
            var self = this;
            var defer = self.q.defer();

            this.resource.get(params, function(data) {
                data.result.pagination = data.pagination;
                data.result.endpoint = self;
                data.result.next = function() {
                    return self.endpoint.get(merge(params, {_skip: this.pagination.skip+this.pagination.limit, _limit: this.pagination.limit}));
                };
                data.result.previous = function() {
                    return self.endpoint.get(merge(params, {_skip: this.pagination.skip-this.pagination.limit, _limit: this.pagination.limit}));
                };
                data.result.page = function(page) {
                    return self.endpoint.get(merge(params, {_skip: page*this.pagination.limit-this.pagination.limit, _limit: this.pagination.limit}));
                };
                defer.resolve(data.result);
            }, function (error) {
                defer.reject(error);
            });

            return defer.promise;
        };

        /**
         * Call an endpoint with the HEAD method
         *
         * @param {object} params The parameters that ether map in the route or get appended as GET parameters
         * @return {Promise<object|Error>}
         * @memberof Endpoint
         */
        Endpoint.prototype.head = function(params) {
            var self = this;

            self.log.debug("apiFactory (" + self.endpointName + "): (HEAD) Endpoint called");

            var defer = this.q.defer();

            // Call the given endpoint and get the promise
            this.resource.head(params, function(data, headersFunc) {
                var headers = headersFunc();

                // Check if a prefix is given
                if (angular.isDefined(self.headResponseHeaderPrefix) && self.headResponseHeaderPrefix !== '*') {

                    for (var header in headers) {
                        // Delete all headers without the given prefix
                        if (header.toLowerCase().indexOf(self.headResponseHeaderPrefix.toLowerCase()) !== 0) {
                            delete headers[header];
                            continue;
                        }

                        // Make a alias without the prefix
                        headers[header.substr(self.headResponseHeaderPrefix.length, header.length)] = headers[header];

                        // Delete the orignial headers
                        //delete headers[header];
                    }
                }

                // Resolve the promise
                defer.resolve(headers);
            }, function (error) {
                defer.reject(error);
            });

            return defer.promise;
        };

        /**
         * Update an object
         *
         * @param {object} params The parameters that ether map in the route or get appended as GET parameters
         * @param {Model/array} model The model to be updated
         * @return {Promise<Model|Error>}
         * @memberof Endpoint
         */
        Endpoint.prototype.update = function (params, model) {


            if (angular.isArray(model)) {
                var tempModels = angular.copy(model);
                model = [];
                angular.forEach(tempModels, function(tempModel) {
                    // Set the action that is performed. This can be checked in the model.
                    tempModel.__method = 'update';
                    tempModel._clean();
                    model.push(tempModel);
                });
            } else {
                // Set the action that is performed. This can be checked in the model.
                model.__method = 'update';
                // Call the _clean method of the model
                model._clean();
            }

            this.log.debug("apiFactory (" + this.endpointName + "): Model to update is:", model);

            var defer = this.q.defer();

            // Use angularjs $resource to perform the update
            this.resource.update(params, model, function (data) {
                defer.resolve(data.result);
            }, function (error) {
                defer.reject(error);
            });

            return defer.promise;
        };

        /**
         * This is an alias of the update method
         */
        Endpoint.prototype.put = Endpoint.prototype.update;

        /**
         * Save an object
         *
         * @param {object} params The parameters that ether map in the route or get appended as GET parameters
         * @param {Model} model The model to be updated
         * @return {Promise<Model|Error>}
         * @memberof Endpoint
         */
        Endpoint.prototype.save = function () {
            var model, params;

            // Check if only two arguments are given
            if (angular.isUndefined(arguments[1])) {
                model = arguments[0];
            } else {
                params = arguments[0];
                model = arguments[1];
            }

            var defer = this.q.defer();

            // Set the action that is performed. This can be checked in the model.
            model.__method = 'save';

            // Call the _clean method of the model
            model._clean();

            this.log.debug("apiFactory (" + this.endpointName + "): Model to save is:", model);

            // Use angularjs $resource to perform the save
            this.resource.save(params, model, function (data) {
                defer.resolve(data.result);
            }, function (error) {
                defer.reject(error);
            });

            return defer.promise;
        };

        /**
         * This is an alias of the save method
         */
        Endpoint.prototype.post = Endpoint.prototype.save;

        /**
         * Remove an object
         *
         * @param {object} params The parameters that ether map in the route or get appended as GET parameters
         * @param {Model} model The model to be updated
         * @return {Promise<Model|Error>}
         * @memberof Endpoint
         */
        Endpoint.prototype.remove = function() {
            var model, params;

            // Check if only two arguments are given
            if (angular.isUndefined(arguments[1])) {
                model = arguments[0];
            } else {
                params = arguments[0];
                model = arguments[1];
            }

            var defer = this.q.defer();

            // Set the action that is performed. This can be checked in the model.
            model.__method = 'remove';

            // Get the id of the model
            var paramId = {
                id: model[model.__reference]
            };



            this.log.debug("apiFactory (" + this.endpointName + "): Model to remove is:", model);

            // Use angularjs $resource to perform the delete
            this.resource.delete(merge(paramId, params), function () {
                defer.resolve();
            }, function (error) {
                defer.reject(error);
            });

            return defer.promise;
        };

        /**
         * This is an alias of the remove method
         */
        Endpoint.prototype.delete = Endpoint.prototype.remove;

        /**
         * Set the base route
         * @param {string} baseRoute
         */
        this.baseRoute = function(baseRoute) {
            this.baseRoute = baseRoute;
        };

        /**
         * Set the head response header prefix
         * @param {string} headResponseHeaderPrefix
         */
        this.headResponseHeaderPrefix = function(headResponseHeaderPrefix) {
            this.headResponseHeaderPrefix = headResponseHeaderPrefix;
        };

        /**
         * Add an endpoint to the endpoint array
         * @param {string} endpoint
         */
        this.endpoint = function(endpoint) {
            var endpointConfig = new EndpointConfig();
            this.endpoints[endpoint] = endpointConfig;
            return endpointConfig;
        };

        /**
         * The factory method
         * @param {$injector} $injector
         * @ngInject
         */
        this.$get = ["$injector", function($injector) {
            var self = this;
            var api = {};

            // Go thru every given endpoint
            angular.forEach(self.endpoints, function (endpointConfig, name) {

                // Check if an container is given and if not, set it to the name of the endpoint
                if (angular.isFunction(endpointConfig.container)) endpointConfig.container = name;

                // Check if headResponseHeaderPrefix is set
                if (angular.isFunction(self.headResponseHeaderPrefix)) delete self.headResponseHeaderPrefix;

                // Get an instance of the endpoint and add it to the api object
                api[name] = $injector.instantiate(Endpoint, {
                    endpoint: name,
                    endpointConfig: endpointConfig,
                    baseRoute: self.baseRoute,
                    headResponseHeaderPrefix: self.headResponseHeaderPrefix
                });
            });

            return api;
        }];
        this.$get.$inject = ["$injector"];
    }

    /**
     * The factory to get the abstract model
     * @constructor
     * @ngInject
     */
    function ModelFactory($log, $injector, Validator) {

        /**
         * Abstract model class
         *
         * @constructor Model
         */
        function Model() {

            /**
             * The __foreignData variable holds the original object as it was injected.
             * This gets deleted after the model is fully initialized.
             * @type {object}
             */
            this.__foreignData = {};

            /**
             * Holds the annotation of every property of a model.
             * This object gets deleted when the model is sent to the backend.
             * @type {object}
             */
            this.__annotation = {};
        }

        /**
         * This method gets called after the response was transformed into te model.
         * It's helpful when you want to remap attributes or make some changed.
         * To use it, just override it in the concrete model.
         *
         * @memberof Model
         */
        Model.prototype.afterLoad = function() {
            return true;
        };

        /**
         * This method gets called before a model gets sent to the backend.
         * It's helpful when you want to remap attributes or make some changed.
         * To use it, just override it in the concrete model.
         *
         * @memberof Model
         */
        Model.prototype.beforeSave = function() {
            return true;
        };

        /**
         * Every model must call this method in it's constructor. It in charge of mapping the given object to the model.
         *
         * @param {object} object The given object. This can come ether from the backend or created manualy
         * @memberof Model
         */
        Model.prototype.init = function(object) {
            this.__foreignData = object;
            this.__annotation = {};

            $log.debug("Model (" + this.constructor.name + "): Original response object is:", this.__foreignData);

            for (var property in this) {
                // If property is a method, then continue
                if (!this.hasOwnProperty(property)) continue;
                if (['__foreignData', '__annotation'].indexOf(property) > -1) continue;

                // If annotations are given, set them
                if (angular.isObject(this[property]) && angular.isDefined(this[property].type)) this.__annotation[property] = this[property];

                // If no object is given, stop here
                if (angular.isUndefined(object)) continue;

                // If the given object does not have an property set, it's going to be null
                if(!angular.isObject(object) || !object.hasOwnProperty(property)) {
                    this[property] = null;
                    continue;
                }

                // Assign the properties
                this[property] = object[property];

                // Check if the property is a relation
                if (angular.isDefined(this.__annotation[property]) && this.__annotation[property].type == 'relation') {
                    var relation = this.__annotation[property].relation;

                    // Check if a foreign field is set and if not, set it to the name of the property
                    if (angular.isUndefined(relation.foreignField)) relation.foreignField = property;

                    // If the foreign field can not be found, continue
                    if (angular.isUndefined(this.__foreignData[relation.foreignField])) continue;

                    // If the foreign field is null, set the property to null
                    if (this.__foreignData[relation.foreignField] === null) {
                        this[property] = null;
                        continue;
                    }

                    // Check which relation typ is defined and map the data
                    if (relation.type == 'many') this._mapArray(property, this.__foreignData[relation.foreignField], relation.model);
                    if (relation.type == 'one') this._mapProperty(property, this.__foreignData[relation.foreignField], relation.model);
                }
            }

            this.afterLoad();
            delete this.__foreignData;
        };

        /**
         * This method can be used to call the beforeSave method on a related model.
         *
         * @param {Model/array} models Can ether be a model or an array of models
         * @memberof Model
         * @deprecated The beforeSave method is called automatically when a save call is performed
         */
        Model.prototype.callBeforeSave = function(models) {

            // Check if models is an array
            if (angular.isArray(models)) {

                // Go thru every model
                angular.forEach(models, function(model) {

                    // Call the _clean method on the related model
                    model._clean();
                });
            }

            // Check if models is an array
            if (angular.isObject(models) && !angular.isArray(models)) {

                // Call the _clean method on the related model
                models._clean();
            }
        };

        /**
         * The __reference is used to get the identifier of a model
         * @type {string}
         */
        Model.prototype.__reference = 'id';

        /**
         * This method gets called bei the api before a model is sent to the backend.
         *
         * @private
         * @memberof Model
         */
        Model.prototype._clean = function() {
            // Call the beforeSave method on the model
            this.beforeSave();

            // Go thru every property of the model
            for (var property in this) {
                // Ckeck if property is a method
                if (!this.hasOwnProperty(property)) continue;

                // Check if property is null
                if (this[property] === null) {
                    delete this[property];
                    continue;
                }

                if (angular.isDefined(this.__annotation[property]) && angular.isDefined(this.__annotation[property].save)) {

                    // Check if property should be deleted before model is saved
                    if (!this.__annotation[property].save) {
                        delete this[property];
                        continue;
                    }

                    // Check if property should only be a reference to another model
                    if (this.__annotation[property].save == 'reference') {
                        this._referenceOnly(this[property]);
                        continue;
                    }
                }

                if (angular.isDefined(this.__annotation[property]) && angular.isDefined(this.__annotation[property].type)) {
                    // If property is a relation then call the _clean method of related models
                    if (this.__annotation[property].type == 'relation' && this[property] !== null) {

                        if (!angular.isDefined(this.__annotation[property].relation.type)) continue;

                        if (this.__annotation[property].relation.type == 'one') {

                            // Call the _clean method on the related model
                            this[property]._clean();
                            continue;
                        }

                        if (this.__annotation[property].relation.type == 'many') {
                            angular.forEach(this[property], function(model) {

                                // Call the _clean method on the related model
                                model._clean();
                            });
                        }
                    }
                }
            }

            // Delete this two properties before model gets saved
            delete this.__method;
            delete this.__annotation;
        };

        /**
         * Maps an array of models to an property
         *
         * @private
         * @param {string} property The property which should be mapped
         * @param {string} apiProperty Foreign property as it comes from the api
         * @param {string} modelName Name of the model which is used for the matching
         * @memberof Model
         */
        Model.prototype._mapArray = function(property, apiProperty, modelName) {
            var self = this;

            // Check if the api property is set
            if (angular.isUndefined(apiProperty) || apiProperty === null || apiProperty.length === 0) {
                self[property] = [];
                return;
            }

            // If no model is set return the raw value
            if (modelName === null) {
                angular.forEach(apiProperty, function(value) {
                    self[property].push(value);
                });
                return;
            }

            // Load the model
            var model = $injector.get(modelName);

            self[property] = [];

            // Map the model
            angular.forEach(apiProperty, function(value) {
                self[property].push(new model(value));
            });
        };

        /**
         * Maps an array of models to an property
         *
         * @private
         * @param {string} property The property which should be mapped
         * @param {string} apiProperty Foreign property as it comes from the api
         * @param {string} modelName Name of the model which is used for the matching
         * @memberof Model
         */
        Model.prototype._mapProperty = function(property, apiProperty, modelName) {

            // Check if the api property is set
            if (angular.isUndefined(apiProperty)) {
                this[property] = null;
                return;
            }


            // If no model is set return the raw value
            if (modelName === null) {
                this[property] = apiProperty;
                return;
            }

            // Load the model
            var model = $injector.get(modelName);

            // Map the model
            this[property] = new model(apiProperty);
        };

        /**
         * Returns only the reference of a related model
         *
         * @private
         * @param {Model/array} models
         * @memberof Model
         */
        Model.prototype._referenceOnly = function(models) {

            // Check if models is an array
            if (angular.isArray(models)) {

                // Go thru all models in the array an call the __referenceOnly method
                angular.forEach(models, function(model) {
                    model._referenceOnly(model);
                });
            } else {

                // Go thru all properties an delete all that are not the identifier
                for (var property in models) {
                    if(models.hasOwnProperty(property)) {
                        if (property != models.__reference) {
                            delete models[property];
                        }
                    }
                }
            }
        };

        /**
         * Validate the properties of the model
         *
         * @memberof Model
         */
        Model.prototype.isValid = function() {
            for (var property in this) {
                // If property is a method, then continue
                if (!this.hasOwnProperty(property)) continue;

                if (angular.isDefined(this.__annotation[property])) {
                    if (!Validator[this.__annotation[property].type](this[property])) return false;
                }
            }

            return true;
        };

        return Model;
    }
    ModelFactory.$inject = ["$log", "$injector", "Validator"];

    function ValidatorFactory() {
        return {
            string: function(string) {
                return angular.isString(string);
            },
            int: function(int) {
                return angular.isNumber(int);
            },
            email: function(email) {
                var re = /^(([^<>()[\]\\.,;:\s@\"]+(\.[^<>()[\]\\.,;:\s@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
                return re.test(email);
            },
            relation: function(relation) {
                return true;
            },
            boolean: function(boolean) {
                return true;
            },
            date: function(date) {
                return angular.isDate(date);
            },
            float: function(float) {
                return angular.isNumber(float);
            }
        };
    }
})();