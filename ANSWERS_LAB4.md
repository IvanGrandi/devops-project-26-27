## Part 2

First, we installed the kube-prometheus-stack Helm chart:

![Add the prometheus-community Helm repository](docs/images/lab4-2-1.png)
![Update the Helm repositories](docs/images/lab4-2-2.png)
![Create the monitoring namespace](docs/images/lab4-2-3.png)
![Install kube-prometheus-stack](docs/images/lab4-2-4.png)

Now all the new pods are running. We can port-forward Grafana and Prometheus to access their interfaces directly through our web browser.

![Pods running in the monitoring namespace](docs/images/lab4-2-5.png)
![Port-forward Grafana on port 3001](docs/images/lab4-2-6.png)
![Port-forward Prometheus on port 9090](docs/images/lab4-2-7.png)

**2.1** We retrieve the Grafana admin password from the Kubernetes secret (the password is hidden in the screenshot):

![Grafana admin password retrieved from the secret](docs/images/lab4-2.1-1.png)

**2.2** Then we open Grafana and display the pre-installed Kubernetes dashboards.

![Pre-installed Kubernetes dashboards in Grafana](docs/images/lab4-2.2-1.png)

**2.3** We also open the Prometheus UI and check the Targets page.

![Targets page in Prometheus](docs/images/lab4-2.3-1.png)

## Part 3

**3.1** We created a servicemonitor.yaml file with the ServiceMonitor. With this configuration, Prometheus can discover the application.

```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: myapp
  namespace: monitoring
  labels:
    release: monitoring
spec:
  namespaceSelector:
    matchNames: ["dev"]
  selector:
    matchLabels:
      app: myapp
  endpoints:
    - port: http
      path: /metrics
      interval: 15s
```

We adjusted the Service by adding http as the name of the port.

![Service with the port named http](docs/images/lab4-3.1-1.png)

We use the apply command to update the configuration of the Service.

![Apply the updated Service](docs/images/lab4-3.1-2.png)

We check that the command displays http.

![The Service port is named http](docs/images/lab4-3.1-3.png)

Then we apply the ServiceMonitor.

![Apply the ServiceMonitor](docs/images/lab4-3.1-4.png)

**3.2** We check that myapp appears:

![The myapp ServiceMonitor is listed](docs/images/lab4-3.2-1.png)

We can see that it is UP in Prometheus:

![The myapp target is UP in Prometheus](docs/images/lab4-3.2-2.png)

**3.3** We generated traffic and queried http_requests_total in the Prometheus UI. Here is our result:

![Query http_requests_total](docs/images/lab4-3.3-1.png)
![Graph of http_requests_total](docs/images/lab4-3.3-2.png)
![Labels of one http_requests_total time series](docs/images/lab4-3.3-3.png)

**Question 3: The target does not appear. List three things you would check.**

If the target doesn't appear, we would check:

- The labels of the ServiceMonitor in metadata.labels, to check that the key/value pairs required by Prometheus (release: monitoring) are present, so that it can select the ServiceMonitor resource.
- The matchLabels and the namespaceSelector, to see if they match the labels and the namespace of the target Service.
- The name of the port in both the Service and the ServiceMonitor, to check that they match.

**Question 4: Why is the 95th percentile more informative than the average latency?**

The majority of requests have very few latency whereas some resquests are very slow. The mean is biased by the huge amount of short requests, but it's not rare that one page does several call to the backend, so users will be likely to encounter at least once a high latency request. the 95th percentile is more representative of the user experience than a simple mean. 

**Question 5: What is alert fatigue and how do the for: clause and severity labels help?**

Alert fatigue is the fact that maintainers recieve too much alerts that aren't critical. Some alerts even get activated just before turning to firing, in other terms the problem they try to fix is quickly solved after they have been actionated, making the notifications irrelevant. With for 2m, the alert, will be notified only if it is pending for at least 2 minutes, decreasing the noise in the logs and making the alerts notification more relevant.

**Question 6: Why mitigate before finding the root cause?**

Mitigate is a temporary solution. It isn't the optimal long-term solution but analysing the root cause can take hours or day before having a proper fix. Every minute of offline time makes usebase decreasing and losing money. We usually mitigate the time we find the root cause.

**Question 7: Why must a postmortem be blameless? Give an example of a blameless rewording of “Alex deployed a bad version**

Blaming people is a bad practice, we don't want people to be scared to take responsibilities for their actions and trying to dissimulate their mistakes.

**Question 8: Propose two concrete changes to the pipeline from Sessions 1 to 3 that would have prevented or limited this incident (for example, canary release or smoke tests).**


