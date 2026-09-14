import { AttachmentsService } from './attachments.service';

describe('AttachmentsService.sanitiseFileName', () => {
  const sanitise = AttachmentsService.sanitiseFileName;

  it('keeps an ordinary filename intact', () => {
    expect(sanitise('diagnostic-log.txt')).toBe('diagnostic-log.txt');
  });

  it('strips directory components from a traversal attempt', () => {
    expect(sanitise('../../../../etc/passwd')).toBe('passwd');
    expect(sanitise('/absolute/path/report.pdf')).toBe('report.pdf');
    expect(sanitise('..\\..\\windows\\system32\\cmd.exe')).toBe('.._.._windows_system32_cmd.exe');
  });

  it('removes characters that break paths or terminals', () => {
    expect(sanitise('in:valid*name?.txt')).toBe('in_valid_name_.txt');
    expect(sanitise('bell\u0007name.txt')).toBe('bellname.txt');
  });

  it('never returns an empty name', () => {
    expect(sanitise('')).toBe('file');
    expect(sanitise('   ')).toBe('file');
    expect(sanitise('/')).toBe('file');
  });

  it('caps the length', () => {
    expect(sanitise(`${'a'.repeat(400)}.txt`)).toHaveLength(200);
  });
});
