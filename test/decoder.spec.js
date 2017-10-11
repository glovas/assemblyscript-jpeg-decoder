var fs = require('fs'),
    path = require('path'),
    expect = require("chai").expect,
    decode = require('./decoder');

describe("The Decoder", function() {
    function fixture(name) {
        return fs.readFileSync(path.join(__dirname, 'fixtures', name));
    }

    it('should be able to decode a JPEG', function() {
        let jpegData = fixture('grumpycat.jpg');
        let rawImageData = decode(jpegData);
        expect(rawImageData.width).to.equal(320);
        expect(rawImageData.height).to.equal(180);
        let expected = fixture('grumpycat.rgba');
        expect(rawImageData.data).to.deep.equal(expected);
      });
});