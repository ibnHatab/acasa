"""acasa's entry to metis-agent's service: the service as it is, with the model's thread count
taken from this machine (the service's LLM defaults to 6 threads, more than a small box has
cores), and with the one domain held as a set of one so the page gets the host's frames.
ACASA_THREADS overrides the thread count; the default is the physical cores."""
import os
import sys


def cores():
    try:
        seen = set()
        for cpu in os.listdir("/sys/devices/system/cpu"):
            p = "/sys/devices/system/cpu/%s/topology/core_id" % cpu
            if cpu.startswith("cpu") and cpu[3:].isdigit() and os.path.exists(p):
                seen.add(open(p).read().strip())
        return len(seen) or os.cpu_count() or 2
    except OSError:
        return os.cpu_count() or 2


def main():
    from metis_agent import llm
    n = int(os.environ.get("ACASA_THREADS") or cores())
    d = list(llm.LLM.__init__.__defaults__)        # (n_ctx, n_batch, n_threads, n_gpu_layers, flash_attn, verbose)
    d[2] = n
    llm.LLM.__init__.__defaults__ = tuple(d)
    # one served domain: the service's Process.build hands back the bare agent, and its world page
    # frames (world_frames: a host's frames()) are read only off a Domains set. A set of one, then.
    from metis_agent import domain_agent as da
    build = da.Process.build

    def build_set(self, *a, **kw):
        ags = build(self, *a, **kw)
        return ags if hasattr(ags, "agents") else da.Domains([ags])
    da.Process.build = build_set
    from metis_agent import service
    sys.exit(service.main())


if __name__ == "__main__":
    main()
