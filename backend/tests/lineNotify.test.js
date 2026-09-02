const test = require('node:test');
const assert = require('node:assert/strict');

const { createComplaintEntryFlexMessage } = require('../src/utils/lineNotify');

test('createComplaintEntryFlexMessage should match complaint entry flex content', () => {
    const message = createComplaintEntryFlexMessage('https://liff.line.me/test?gid=C123');

    assert.equal(message.type, 'flex');
    assert.equal(message.altText, 'กดปุ่มด้านล่างเพื่อแจ้งเรื่อง');
    assert.equal(message.contents.header.contents[0].text, '📋 ระบบรับแจ้งเรื่อง');
    assert.equal(message.contents.footer.contents[0].action.label, '📝 เข้าสู่ระบบแจ้งเรื่อง');
    assert.equal(message.contents.footer.contents[0].action.uri, 'https://liff.line.me/test?gid=C123');
});
