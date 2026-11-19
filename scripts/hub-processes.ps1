param($Action, $Roster, $HubPid, $ChildPid)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)

# Only registered roots are targeted because unrecorded descendants cannot be proved after a root exits.
$source = @'
using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using Microsoft.Win32.SafeHandles;

namespace CanopusHubProcesses317
{
    public sealed class Reply
    {
        public string Json;
        public int ExitCode;
    }

    internal sealed class Failure : Exception
    {
        public Failure(string code) : base(code) { }
    }

    internal sealed class ProcessHandle : SafeHandleZeroOrMinusOneIsInvalid
    {
        public ProcessHandle() : base(true) { }
        protected override bool ReleaseHandle() { return Native.CloseHandle(handle); }
    }

    internal static class Native
    {
        [StructLayout(LayoutKind.Sequential)]
        internal struct Time { public uint Low, High; }
        [StructLayout(LayoutKind.Sequential)]
        internal struct BasicInfo
        {
            public IntPtr Reserved1, Peb, Reserved2, Reserved3;
            public UIntPtr Pid, ParentPid;
        }
        [StructLayout(LayoutKind.Sequential)]
        internal struct FileInfo
        {
            public uint Attributes;
            public Time Created, Accessed, Written;
            public uint Volume, SizeHigh, SizeLow, Links, IndexHigh, IndexLow;
        }
        [StructLayout(LayoutKind.Sequential)]
        internal struct Disposition { public byte Delete; }

        [DllImport("kernel32.dll", SetLastError = true)]
        internal static extern ProcessHandle OpenProcess(uint access, bool inherit, int pid);
        [DllImport("kernel32.dll", SetLastError = true)]
        internal static extern bool CloseHandle(IntPtr handle);
        [DllImport("kernel32.dll", SetLastError = true)]
        internal static extern bool GetProcessTimes(ProcessHandle handle, out Time created, out Time exited, out Time kernel, out Time user);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        internal static extern bool QueryFullProcessImageName(ProcessHandle handle, uint flags, StringBuilder image, ref uint size);
        [DllImport("ntdll.dll")]
        internal static extern int NtQueryInformationProcess(ProcessHandle handle, int infoClass, out BasicInfo info, uint size, out uint returned);
        [DllImport("kernel32.dll", SetLastError = true)]
        internal static extern uint WaitForSingleObject(ProcessHandle handle, uint milliseconds);
        [DllImport("kernel32.dll", SetLastError = true)]
        internal static extern bool TerminateProcess(ProcessHandle handle, uint code);
        [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        internal static extern SafeFileHandle CreateFile(string name, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
        [DllImport("kernel32.dll", SetLastError = true)]
        internal static extern bool GetFileInformationByHandle(SafeFileHandle handle, out FileInfo info);
        [DllImport("kernel32.dll", SetLastError = true)]
        internal static extern bool SetFileInformationByHandle(SafeFileHandle handle, int infoClass, ref Disposition info, uint size);
    }

    public static class Registry
    {
        private const int MaxEntries = 128, MaxBytes = 262144, MaxImage = 32768;
        private const uint Query = 0x1000, QueryParent = 0x400, Sync = 0x100000, Terminate = 1;
        private static readonly UTF8Encoding Utf8 = new UTF8Encoding(false, true);
        private static readonly Regex RecordName = new Regex(@"\A[1-9][0-9]{0,9}-[1-9][0-9]{0,18}\.json\z", RegexOptions.CultureInvariant);
        private static readonly JavaScriptSerializer Json = new JavaScriptSerializer { MaxJsonLength = MaxBytes, RecursionLimit = 8 };

        private sealed class Identity
        {
            public int Pid, ParentPid;
            public string Birth, Image;
        }
        private sealed class Record
        {
            public Identity Child, Hub;
            public string Name { get { return Child.Pid.ToString(CultureInfo.InvariantCulture) + "-" + Child.Birth + ".json"; } }
            public Dictionary<string, object> Fields()
            {
                return new Dictionary<string, object> {
                    { "version", 1 }, { "pid", Child.Pid }, { "birth", Child.Birth }, { "image", Child.Image },
                    { "parentPid", Child.ParentPid }, { "hubPid", Hub.Pid }, { "hubBirth", Hub.Birth }, { "hubImage", Hub.Image }
                };
            }
        }

        private static Failure Win32(string operation)
        {
            return new Failure(operation + "-win32-" + Marshal.GetLastWin32Error().ToString(CultureInfo.InvariantCulture));
        }
        private static string SafeError(Exception error)
        {
            Failure known = error as Failure;
            return known == null ? "registry-operation-failed" : known.Message;
        }
        private static int PidArgument(string text)
        {
            int value;
            if (text == null || text.Length > 10 || !Int32.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out value) || value <= 0)
                throw new Failure("invalid-pid");
            return value;
        }
        private static ulong Ticks(string text)
        {
            ulong value;
            if (text == null || text.Length == 0 || text.Length > 19 || text[0] == '0' ||
                !UInt64.TryParse(text, NumberStyles.None, CultureInfo.InvariantCulture, out value) || value > Int64.MaxValue)
                throw new Failure("invalid-record-birth");
            return value;
        }
        private static bool FullImage(string image)
        {
            if (String.IsNullOrEmpty(image) || image.Length > MaxImage || !Path.IsPathRooted(image)) return false;
            if (!(image.Length > 3 && Char.IsLetter(image[0]) && image[1] == ':' && image[2] == '\\') && !image.StartsWith(@"\\", StringComparison.Ordinal)) return false;
            foreach (char c in image) if (Char.IsControl(c)) return false;
            return true;
        }
        private static ProcessHandle Open(int pid, uint access, string who)
        {
            ProcessHandle handle = Native.OpenProcess(access, false, pid);
            if (!handle.IsInvalid) return handle;
            int error = Marshal.GetLastWin32Error();
            handle.Dispose();
            // Access denied is unknown, not proof that the old process has exited.
            if (error == 87) return null;
            throw new Failure(who + "-open-win32-" + error.ToString(CultureInfo.InvariantCulture));
        }
        private static bool Alive(ProcessHandle handle, string who)
        {
            uint status = Native.WaitForSingleObject(handle, 0);
            if (status == 0) return false;
            if (status == 258) return true;
            if (status == UInt32.MaxValue) throw Win32(who + "-wait");
            throw new Failure(who + "-wait-unexpected");
        }
        private static Identity Identify(ProcessHandle handle, int pid, bool parent, string who)
        {
            Native.Time created, exited, kernel, user;
            if (!Native.GetProcessTimes(handle, out created, out exited, out kernel, out user)) throw Win32(who + "-times");
            ulong ticks = ((ulong)created.High << 32) | created.Low;
            uint size = MaxImage;
            StringBuilder image = new StringBuilder(MaxImage);
            if (!Native.QueryFullProcessImageName(handle, 0, image, ref size)) throw Win32(who + "-image");
            Identity result = new Identity { Pid = pid, Birth = ticks.ToString(CultureInfo.InvariantCulture), Image = image.ToString() };
            Ticks(result.Birth);
            if (size == 0 || size >= MaxImage || !FullImage(result.Image)) throw new Failure(who + "-invalid-image");
            if (parent)
            {
                Native.BasicInfo info;
                uint returned, length = (uint)Marshal.SizeOf(typeof(Native.BasicInfo));
                int status = Native.NtQueryInformationProcess(handle, 0, out info, length, out returned);
                if (status != 0) throw new Failure(who + "-parent-ntstatus-" + unchecked((uint)status).ToString("X8", CultureInfo.InvariantCulture));
                if (returned != length || info.Pid.ToUInt64() != (ulong)pid || info.ParentPid.ToUInt64() > Int32.MaxValue)
                    throw new Failure(who + "-invalid-parent");
                result.ParentPid = (int)info.ParentPid.ToUInt64();
            }
            return result;
        }
        private static bool Same(Identity actual, Identity saved)
        {
            return actual.Pid == saved.Pid && actual.Birth == saved.Birth && String.Equals(actual.Image, saved.Image, StringComparison.OrdinalIgnoreCase);
        }
        private static int RecordPid(Dictionary<string, object> fields, string key)
        {
            object value;
            if (!fields.TryGetValue(key, out value) || !(value is int) || (int)value <= 0) throw new Failure("invalid-record-pid");
            return (int)value;
        }
        private static string RecordString(Dictionary<string, object> fields, string key)
        {
            object value;
            if (!fields.TryGetValue(key, out value) || !(value is string)) throw new Failure("invalid-record-field");
            return (string)value;
        }
        private static Record ReadRecord(FileStream file, string name)
        {
            if (file.Length == 0 || file.Length > MaxBytes) throw new Failure("invalid-record-size");
            byte[] bytes = new byte[(int)file.Length];
            int offset = 0;
            while (offset < bytes.Length)
            {
                int count = file.Read(bytes, offset, bytes.Length - offset);
                if (count == 0) throw new Failure("record-short-read");
                offset += count;
            }
            Dictionary<string, object> fields;
            try { fields = Json.DeserializeObject(Utf8.GetString(bytes)) as Dictionary<string, object>; }
            catch { throw new Failure("invalid-record-json"); }
            object version;
            if (fields == null || fields.Count != 8 || !fields.TryGetValue("version", out version) || !(version is int) || (int)version != 1)
                throw new Failure("invalid-record-schema");
            Record record = new Record {
                Child = new Identity { Pid = RecordPid(fields, "pid"), ParentPid = RecordPid(fields, "parentPid"), Birth = RecordString(fields, "birth"), Image = RecordString(fields, "image") },
                Hub = new Identity { Pid = RecordPid(fields, "hubPid"), Birth = RecordString(fields, "hubBirth"), Image = RecordString(fields, "hubImage") }
            };
            if (Ticks(record.Child.Birth) < Ticks(record.Hub.Birth) || record.Child.ParentPid != record.Hub.Pid || record.Child.Pid == record.Hub.Pid ||
                !FullImage(record.Child.Image) || !FullImage(record.Hub.Image) || name != record.Name)
                throw new Failure("invalid-record-identity");
            return record;
        }
        private static FileStream LockRecord(string path, bool deleting)
        {
            // The exclusive file handle binds deletion to the record read, not a replacement at the same path.
            SafeFileHandle handle = Native.CreateFile(path, 0x80000000u | (deleting ? 0x10000u : 0u), 0, IntPtr.Zero, 3, 0x00200000, IntPtr.Zero);
            if (handle.IsInvalid)
            {
                int error = Marshal.GetLastWin32Error();
                handle.Dispose();
                if (error == 2 || error == 3) return null;
                throw new Failure("record-open-win32-" + error.ToString(CultureInfo.InvariantCulture));
            }
            try
            {
                Native.FileInfo info;
                if (!Native.GetFileInformationByHandle(handle, out info)) throw Win32("record-info");
                if ((info.Attributes & (0x400u | 0x10u)) != 0 || info.Links != 1) throw new Failure("record-not-plain-file");
                return new FileStream(handle, FileAccess.Read);
            }
            catch { handle.Dispose(); throw; }
        }
        private static void Drop(FileStream file)
        {
            Native.Disposition disposition = new Native.Disposition { Delete = 1 };
            if (!Native.SetFileInformationByHandle(file.SafeFileHandle, 4, ref disposition, 1)) throw Win32("record-delete");
        }
        private static string RosterPath(string value, bool create)
        {
            if (String.IsNullOrWhiteSpace(value) || value.Length > 1024) throw new Failure("invalid-roster");
            string full = Path.GetFullPath(value);
            if (full.Length < 3 || !Char.IsLetter(full[0]) || full[1] != ':' || full[2] != '\\' || full.IndexOf(':', 2) >= 0)
                throw new Failure("roster-must-be-local");
            DirectoryInfo directory = new DirectoryInfo(full);
            bool missing = false;
            for (DirectoryInfo part = directory; part != null; part = part.Parent)
            {
                try
                {
                    FileAttributes attributes = File.GetAttributes(part.FullName);
                    if ((attributes & FileAttributes.ReparsePoint) != 0 || (attributes & FileAttributes.Directory) == 0)
                        throw new Failure("roster-not-plain-directory");
                }
                catch (DirectoryNotFoundException) { missing = true; }
                catch (FileNotFoundException) { missing = true; }
            }
            if (missing)
            {
                if (!create) return null;
                Directory.CreateDirectory(full);
                return RosterPath(full, false);
            }
            return full;
        }
        private static void Publish(string roster, Record record)
        {
            string temporary = Path.Combine(roster, Guid.NewGuid().ToString("N") + ".tmp");
            string destination = Path.Combine(roster, record.Name);
            try
            {
                byte[] bytes = Utf8.GetBytes(Json.Serialize(record.Fields()));
                if (bytes.Length > MaxBytes) throw new Failure("record-too-large");
                using (FileStream output = new FileStream(temporary, FileMode.CreateNew, FileAccess.Write, FileShare.None))
                {
                    output.Write(bytes, 0, bytes.Length);
                    output.Flush(true);
                }
                try { File.Move(temporary, destination); }
                catch (IOException)
                {
                    using (FileStream existing = LockRecord(destination, false))
                    {
                        if (existing == null) throw new Failure("record-publish-failed");
                        Record saved = ReadRecord(existing, record.Name);
                        if (!Same(saved.Child, record.Child) || !Same(saved.Hub, record.Hub) || saved.Child.ParentPid != record.Child.ParentPid)
                            throw new Failure("record-conflict");
                    }
                }
            }
            finally { File.Delete(temporary); }
        }
        private static void Register(string roster, int hubPid, int childPid)
        {
            if (hubPid == childPid) throw new Failure("child-is-hub");
            using (ProcessHandle hub = Open(hubPid, Query | Sync, "hub"))
            using (ProcessHandle child = Open(childPid, Query | QueryParent | Sync, "child"))
            {
                if (hub == null || !Alive(hub, "hub")) throw new Failure("hub-not-alive");
                if (child == null || !Alive(child, "child")) throw new Failure("child-not-alive");
                Identity hubIdentity = Identify(hub, hubPid, false, "hub");
                Identity childIdentity = Identify(child, childPid, true, "child");
                if (childIdentity.ParentPid != hubPid) throw new Failure("child-parent-mismatch");
                if (Ticks(childIdentity.Birth) < Ticks(hubIdentity.Birth)) throw new Failure("child-predates-hub");
                if (!Alive(hub, "hub") || !Alive(child, "child")) throw new Failure("registration-process-exited");
                Publish(RosterPath(roster, true), new Record { Child = childIdentity, Hub = hubIdentity });
            }
        }
        private static void SweepRecord(FileStream file, Record record, List<int> ended)
        {
            // Terminate rights and identity belong to one held handle; a recycled PID is never reopened to kill.
            using (ProcessHandle child = Open(record.Child.Pid, Query | QueryParent | Sync | Terminate, "child"))
            {
                if (child == null || !Alive(child, "child")) { Drop(file); return; }
                Identity actual = Identify(child, record.Child.Pid, true, "child");
                if (!Same(actual, record.Child) || actual.ParentPid != record.Child.ParentPid) { Drop(file); return; }
                using (ProcessHandle hub = Open(record.Hub.Pid, Query | Sync, "hub"))
                {
                    if (hub != null && Alive(hub, "hub"))
                    {
                        Identity owner = Identify(hub, record.Hub.Pid, false, "hub");
                        if (Same(owner, record.Hub)) return;
                    }
                    if (!Alive(child, "child")) { Drop(file); return; }
                    if (!Native.TerminateProcess(child, 1)) throw Win32("child-terminate");
                    uint wait = Native.WaitForSingleObject(child, 2000);
                    if (wait == UInt32.MaxValue) throw Win32("child-termination-wait");
                    if (wait != 0) throw new Failure(wait == 258 ? "child-termination-timeout" : "child-termination-wait-unexpected");
                    ended.Add(record.Child.Pid);
                    Drop(file);
                }
            }
        }
        public static Reply Run(string action, string roster, string hubPidText, string childPidText)
        {
            try
            {
                int hubPid = PidArgument(hubPidText);
                if (action == "Register")
                {
                    Register(roster, hubPid, PidArgument(childPidText));
                    return new Reply { Json = "{\"ok\":true}", ExitCode = 0 };
                }
                if (action != "Sweep") throw new Failure("invalid-action");
                string directory = RosterPath(roster, false);
                List<int> ended = new List<int>();
                List<string> errors = new List<string>();
                if (directory != null)
                {
                    int count = 0;
                    // Each record supplies its old hub identity so a new hub can collect a predecessor's roots.
                    foreach (string path in Directory.EnumerateFileSystemEntries(directory, "*.json", SearchOption.TopDirectoryOnly))
                    {
                        if (!path.EndsWith(".json", StringComparison.OrdinalIgnoreCase)) continue;
                        if (count == MaxEntries) { errors.Add("registry-entry-limit-128"); break; }
                        count++;
                        try
                        {
                            string name = Path.GetFileName(path);
                            if (!RecordName.IsMatch(name)) throw new Failure("invalid-record-name");
                            using (FileStream file = LockRecord(path, true))
                            {
                                if (file != null) SweepRecord(file, ReadRecord(file, name), ended);
                            }
                        }
                        catch (Exception error) { errors.Add("entry-" + count.ToString(CultureInfo.InvariantCulture) + ":" + SafeError(error)); }
                    }
                }
                return new Reply { Json = Json.Serialize(new { ok = true, ended = ended, errors = errors }), ExitCode = errors.Count == 0 ? 0 : 1 };
            }
            catch (Exception error)
            {
                return new Reply { Json = Json.Serialize(new { ok = false, error = SafeError(error) }), ExitCode = 1 };
            }
        }
    }
}
'@

try {
    $null = Add-Type -TypeDefinition $source -ReferencedAssemblies System.dll, System.Core.dll, System.Web.Extensions.dll
    $result = [CanopusHubProcesses317.Registry]::Run([string]$Action, [string]$Roster, [string]$HubPid, [string]$ChildPid)
    [Console]::Out.WriteLine($result.Json)
    exit $result.ExitCode
} catch {
    [Console]::Out.WriteLine('{"ok":false,"error":"helper-initialization-failed"}')
    exit 1
}
