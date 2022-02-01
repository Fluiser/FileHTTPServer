var Object = Object;
Object.prototype.toString = function () {
	return JSON.stringify(this);
};
String.prototype['toObject'] = function () {
	return JSON.parse(this);
};
