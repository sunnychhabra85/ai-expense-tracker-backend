# 🔍 Correlation IDs for Distributed Tracing - Complete Guide

## What Are Correlation IDs?

**Correlation IDs** are unique identifiers that track a single request as it flows through multiple microservices in your distributed system.

---

## The Problem

When a user makes one request to your API Gateway, it might trigger calls to 5+ services:

```
User Request → API Gateway → Auth Service → Database
                           ↓
                        Upload Service → S3
                           ↓
                        Processing Service → SQS → Textract
                           ↓
                        Analytics Service → Redis
```

**Without correlation IDs:** If something fails, you have logs in 5 different services with no way to connect them. Which logs belong to the same user request? 🤷

**With correlation IDs:** Every log entry for that request has the same ID, making debugging trivial! 🎯

---

## How It Works in Your Application

### Request Flow with Correlation ID:

```
1. User → POST /api/v1/upload
   
2. API Gateway (receives request)
   - No x-correlation-id header? Generate one: "abc-123-xyz"
   - Attach to request headers
   - Forward to Upload Service
   
3. Upload Service (receives forwarded request)
   - Reads x-correlation-id: "abc-123-xyz"
   - Uses same ID in all logs
   - Sends message to SQS with this ID
   
4. Processing Service (polls SQS)
   - Reads correlation ID from message
   - Uses same "abc-123-xyz" in all logs
   - Updates database with this ID
   
5. Database records have correlationId: "abc-123-xyz"
```

**Result:** Every log entry, database record, and message for this upload has the same ID!

---

## Implementation in Your System

### 1. API Gateway (Entry Point)

**File:** `apps/api-gateway/src/common/interceptors/correlation.interceptor.ts`

```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CorrelationInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    // Generate correlation ID if not present (API Gateway is the entry point)
    let correlationId = req.headers['x-correlation-id'] as string;
    
    if (!correlationId) {
      correlationId = uuidv4();
      this.logger.debug(`Generated new correlation ID: ${correlationId}`);
    } else {
      this.logger.debug(`Using existing correlation ID: ${correlationId}`);
    }

    // Attach to request object for downstream use
    req.correlationId = correlationId;
    
    // Set in request headers so proxy forwards it
    req.headers['x-correlation-id'] = correlationId;

    // Return in response for client-side tracing
    res.setHeader('x-correlation-id', correlationId);

    return next.handle();
  }
}
```

**Registered in:** `apps/api-gateway/src/main.ts`
```typescript
app.useGlobalInterceptors(new CorrelationInterceptor());
```

### 2. Downstream Services (Upload, Processing, Analytics, etc.)

**File:** `apps/upload-service/src/common/interceptors/correlation.interceptor.ts`

```typescript
@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();

    // Use existing correlation ID from upstream (API Gateway passes it)
    // or generate a new one if this is the originating request
    const correlationId =
      (req.headers['x-correlation-id'] as string) || uuidv4();

    // Attach to request so services can read it
    req.correlationId = correlationId;

    // Echo it back in response headers for client-side tracing
    res.setHeader('x-correlation-id', correlationId);

    return next.handle();
  }
}
```

### 3. SQS Message Passing

**File:** `apps/upload-service/src/upload/sqs.service.ts`

```typescript
// Passing correlation ID to processing service via SQS
const params = {
  QueueUrl: this.queueUrl,
  MessageBody: JSON.stringify({
    documentId: job.documentId,
    userId: job.userId,
    // ... other fields
  }),
  MessageAttributes: {
    correlationId: {
      DataType: 'String',
      StringValue: job.correlationId  // Same ID flows through!
    }
  }
};
```

**Processing Service reads it:**
```typescript
const correlationId = message.MessageAttributes?.correlationId?.StringValue || 'unknown';
```

### 4. CORS Configuration

All services expose the correlation ID in response headers:

**File:** `apps/analytics-service/src/main.ts`
```typescript
app.enableCors({
  allowedHeaders: ['Content-Type', 'Authorization', 'x-correlation-id'],
  exposedHeaders: ['x-correlation-id'],  // Allow client to read it
});
```

---

## Real-World Example

### Scenario: User uploads a PDF, but it fails to process.

#### Without Correlation IDs: 😰
```
API Gateway logs: "Request received at 10:00:01"
Upload Service logs: "File uploaded at 10:00:02"  
Processing Service logs: "Processing failed at 10:00:15"
```
❌ **Which upload failed? No idea!**

#### With Correlation IDs: 🎉
```
API Gateway:        [abc-123] Request received at 10:00:01
Upload Service:     [abc-123] File uploaded to S3: invoice.pdf  
Processing Service: [abc-123] Textract extraction failed: Unsupported format
Database:           [abc-123] Document status: FAILED
```
✅ **Crystal clear! Search logs for "abc-123" to see the entire journey.**

---

## Benefits

### 1. 🔍 Easy Debugging
```bash
# Find all logs for one request
kubectl logs -n finance-platform deployment/upload-service | grep "abc-123"
kubectl logs -n finance-platform deployment/processing-service | grep "abc-123"
```

### 2. 📊 End-to-End Tracing
- See exactly how long each service took
- Identify bottlenecks
- Track request path through system

### 3. 🚨 Faster Error Resolution
- User reports a failed upload
- They give you the correlation ID from their response
- You trace the exact failure point in seconds

### 4. 📈 Better Observability
- Integrate with tools like Jaeger, Zipkin, or AWS X-Ray
- Visualize request flows
- Measure service dependencies

---

## How to Use It

### 1. View Correlation ID in Response

```bash
curl -v http://localhost:3000/api/v1/upload/presigned-url
```

**Response headers:**
```
x-correlation-id: f47ac10b-58cc-4372-a567-0e02b2c3d479
```

### 2. Search Logs by Correlation ID

**Local logs:**
```bash
grep "f47ac10b-58cc-4372-a567-0e02b2c3d479" *.log
```

**Kubernetes:**
```bash
kubectl logs -n finance-platform -l app=upload-service | grep "f47ac10b"
kubectl logs -n finance-platform -l app=processing-service | grep "f47ac10b"
```

**CloudWatch (if using AWS):**
```bash
aws logs filter-log-events \
  --log-group-name /aws/eks/finance-platform \
  --filter-pattern "f47ac10b"
```

### 3. Add to Application Logs

**Current implementation (already done):**
```typescript
this.logger.log(`[${req.correlationId}] Processing upload for user ${userId}`);
this.logger.error(`[${req.correlationId}] Failed to process document: ${error.message}`);
```

**In controllers:**
```typescript
@Post('presigned-url')
async getPresignedUrl(@Body() dto: PresignedUrlDto, @Req() req: any) {
  const correlationId = req.correlationId;
  this.logger.log(`[${correlationId}] Generating presigned URL for user ${req.user.id}`);
  
  // ... your logic
}
```

---

## Visual Flow Diagram

```
USER REQUEST
     ↓
┌────────────────────────────────────────┐
│  API Gateway (Port 3000)               │
│  Generates: x-correlation-id: abc-123  │
│  Logs: [abc-123] POST /upload          │
└─────────────────┬──────────────────────┘
                  ↓ (forwards header)
┌────────────────────────────────────────┐
│  Upload Service (Port 3002)            │
│  Reads: x-correlation-id: abc-123      │
│  Logs: [abc-123] Creating presigned URL│
│  SQS Message: correlationId: abc-123   │
└─────────────────┬──────────────────────┘
                  ↓ (via SQS)
┌────────────────────────────────────────┐
│  Processing Service (Port 3003)        │
│  Reads: correlationId: abc-123 from SQS│
│  Logs: [abc-123] Starting Textract    │
│  Database: sets correlationId=abc-123  │
└────────────────────────────────────────┘

All three services share the SAME ID!
```

---

## Enhancement: Integrate with Prometheus

You can add correlation IDs to your Prometheus metrics:

**File:** `libs/shared-monitoring/src/metrics/metrics.interceptor.ts`

```typescript
intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
  const request = context.switchToHttp().getRequest();
  const correlationId = request.correlationId || 'unknown';
  
  // Record metrics with correlation ID
  this.requestCounter.inc({
    method: request.method,
    route: request.route?.path,
    status: response.statusCode.toString(),
    service: process.env.SERVICE_NAME,
    correlation_id: correlationId  // Add this!
  });
}
```

**Benefits:**
- Query metrics by correlation ID
- See which requests caused high latency
- Track error patterns
- Correlate logs with metrics

---

## Integration with Distributed Tracing Tools

### Option 1: AWS X-Ray (Recommended for AWS)

```bash
npm install aws-xray-sdk-core
```

```typescript
import AWSXRay from 'aws-xray-sdk-core';

// In main.ts
AWSXRay.captureHTTPsGlobal(require('http'));
AWSXRay.captureHTTPsGlobal(require('https'));
AWSXRay.capturePromise();

// Use correlation ID as trace ID
AWSXRay.middleware.setSamplingRules({
  version: 2,
  default: {
    fixed_target: 1,
    rate: 0.05
  }
});
```

### Option 2: Jaeger (Open Source)

```bash
npm install jaeger-client
```

```typescript
import { initTracer } from 'jaeger-client';

const config = {
  serviceName: 'auth-service',
  sampler: {
    type: 'const',
    param: 1
  },
  reporter: {
    logSpans: true,
    agentHost: 'localhost',
    agentPort: 6831
  }
};

const tracer = initTracer(config);
```

### Option 3: OpenTelemetry (Vendor-Neutral)

```bash
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node
```

```typescript
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';

const sdk = new NodeSDK({
  traceExporter: new ConsoleSpanExporter(),
  instrumentations: [getNodeAutoInstrumentations()]
});

sdk.start();
```

---

## Best Practices

### ✅ DO:

1. **Generate at entry point** (API Gateway)
2. **Propagate through all services** (HTTP headers, message queues)
3. **Include in all log statements**
4. **Return in response headers** (for client-side debugging)
5. **Store in database** (for historical tracing)
6. **Use standard header name** (`x-correlation-id` or `x-request-id`)

### ❌ DON'T:

1. **Don't regenerate** in downstream services if already present
2. **Don't expose sensitive data** in correlation IDs
3. **Don't use sequential IDs** (use UUIDs for uniqueness)
4. **Don't hardcode** correlation IDs for testing
5. **Don't forget to propagate** through async operations (queues, events)

---

## Testing Correlation IDs

### 1. Manual Testing

```bash
# Send request with custom correlation ID
curl -H "x-correlation-id: test-123" \
     -H "Content-Type: application/json" \
     -X POST http://localhost:3000/api/v1/upload/presigned-url \
     -d '{"fileName": "test.pdf", "contentType": "application/pdf"}'

# Check logs
kubectl logs -n finance-platform deployment/upload-service | grep "test-123"
```

### 2. Automated Testing

```typescript
// test/e2e/correlation.e2e-spec.ts
describe('Correlation ID propagation', () => {
  it('should propagate correlation ID through services', async () => {
    const correlationId = 'test-correlation-123';
    
    const response = await request(app.getHttpServer())
      .post('/api/v1/upload/presigned-url')
      .set('x-correlation-id', correlationId)
      .send({ fileName: 'test.pdf', contentType: 'application/pdf' });
    
    expect(response.headers['x-correlation-id']).toBe(correlationId);
  });
});
```

---

## Troubleshooting

### Issue: Correlation ID not propagating

**Check:**
1. Interceptor is registered globally
2. CORS allows `x-correlation-id` header
3. Proxy forwards the header
4. Downstream services read it from headers

**Debug:**
```typescript
// Add debug logging
this.logger.debug(`Correlation ID: ${req.correlationId}`);
this.logger.debug(`Headers: ${JSON.stringify(req.headers)}`);
```

### Issue: Lost in async operations

**Solution:** Pass correlation ID explicitly

```typescript
// In SQS messages
await this.sqsService.sendMessage({
  ...data,
  correlationId: req.correlationId
});

// In event emitters
this.eventEmitter.emit('document.processed', {
  documentId,
  correlationId: req.correlationId
});
```

---

## Current Status in Your Application

✅ **Implemented:**
- API Gateway generates correlation IDs
- All services accept and propagate correlation IDs
- CORS configured to expose correlation IDs
- SQS messages include correlation IDs
- Database stores correlation IDs

✅ **Working:**
- HTTP request tracing across services
- SQS message tracing
- Log correlation

🔄 **Can Be Enhanced:**
- Structured logging with Winston (currently using NestJS Logger)
- Integration with distributed tracing tools (Jaeger, X-Ray)
- Prometheus metrics with correlation IDs
- Database queries tagged with correlation IDs

---

## Summary

### What It Is:
Correlation IDs are unique identifiers that track requests across multiple services.

### Why It Matters:
Makes debugging distributed systems possible by connecting related log entries.

### Your Implementation:
✅ Already implemented across all services  
✅ Flows through HTTP headers and SQS messages  
✅ Returns to client for reference

### How to Use:
1. Check response headers for `x-correlation-id`
2. Search logs with that ID
3. See the complete request journey

### Next Steps:
- Add correlation IDs to Prometheus metrics
- Implement structured logging with Winston
- Consider integrating AWS X-Ray or Jaeger for visual tracing

---

## Related Files

- `apps/api-gateway/src/common/interceptors/correlation.interceptor.ts`
- `apps/upload-service/src/common/interceptors/correlation.interceptor.ts`
- `apps/upload-service/src/upload/sqs.service.ts`
- `apps/processing-service/src/processing/processing.service.ts`

---

## Further Reading

- [Distributed Tracing in Microservices](https://microservices.io/patterns/observability/distributed-tracing.html)
- [AWS X-Ray Documentation](https://docs.aws.amazon.com/xray/)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [The Twelve-Factor App: Logs](https://12factor.net/logs)
